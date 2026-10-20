package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

import java.time.Duration;
import java.util.Map;

import com.staffsync.auth.JwtProperties;
import com.staffsync.auth.JwtService;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Import({ TestcontainersConfiguration.class, AuthControllerTests.PmOnlyController.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerTests {

	private static final String PASSWORD = "Password123!";

	@LocalServerPort
	int port;

	@Autowired
	UserRepository userRepository;

	@Autowired
	JwtProperties jwtProperties;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@ParameterizedTest
	@CsvSource({ "vukasin_admin@staffsync.local, ADMIN", "mateja_pm@staffsync.local, PM", "lazar_rm@staffsync.local, RM",
			"bogdan_employee@staffsync.local, EMPLOYEE" })
	void eachSeededRoleCanLogIn(String email, String role) {
		login(email, PASSWORD)
			.then()
			.statusCode(200)
			.body("token", not(emptyOrNullString()))
			.body("user.email", equalTo(email))
			.body("user.role", equalTo(role))
			.body("user.firstName", not(emptyOrNullString()))
			.body("user.passwordHash", equalTo(null));
	}

	@Test
	void emailIsCaseInsensitive() {
		login("Mateja_PM@StaffSync.local", PASSWORD).then().statusCode(200);
	}

	// T-27
	@Test
	void wrongPasswordAndUnknownEmailGetTheSameGeneric401() {
		Response wrongPassword = login("mateja_pm@staffsync.local", "wrong-password");
		Response unknownEmail = login("nobody@staffsync.local", PASSWORD);

		wrongPassword.then().statusCode(401).body("code", equalTo("UNAUTHORIZED"))
			.body("message", equalTo("Invalid email or password"));
		unknownEmail.then().statusCode(401).body("code", equalTo("UNAUTHORIZED"))
			.body("message", equalTo("Invalid email or password"));
	}

	// T-37
	@Test
	void inactiveUserCannotLogIn() {
		User employee = userRepository.findByEmailIgnoreCase("bogdan_employee@staffsync.local").orElseThrow();
		employee.setActive(false);
		userRepository.save(employee);
		try {
			login("bogdan_employee@staffsync.local", PASSWORD)
				.then()
				.statusCode(401)
				.body("message", equalTo("Invalid email or password"));
		}
		finally {
			employee.setActive(true);
			userRepository.save(employee);
		}
	}

	@Test
	void blankCredentialsAreRejectedWith400() {
		given().contentType(ContentType.JSON)
			.body(Map.of("email", "", "password", ""))
			.when().post("/api/auth/login")
			.then()
			.statusCode(400);
	}

	@Test
	void meReturnsTheCurrentUser() {
		String token = tokenFor("lazar_rm@staffsync.local");

		given().auth().oauth2(token)
			.when().get("/api/auth/me")
			.then()
			.statusCode(200)
			.body("email", equalTo("lazar_rm@staffsync.local"))
			.body("role", equalTo("RM"));
	}

	// T-26
	@Test
	void meWithoutTokenIs401() {
		given().when().get("/api/auth/me").then().statusCode(401).body("code", equalTo("UNAUTHORIZED"));
	}

	// T-26
	@Test
	void meWithInvalidTokenIs401() {
		given().auth().oauth2("not-a-real-token").when().get("/api/auth/me").then().statusCode(401);
	}

	// T-26
	@Test
	void meWithExpiredTokenIs401() {
		User admin = userRepository.findByEmailIgnoreCase("vukasin_admin@staffsync.local").orElseThrow();
		String expired = new JwtService(new JwtProperties(jwtProperties.secret(), Duration.ofSeconds(-1)))
			.generateToken(admin);

		given().auth().oauth2(expired).when().get("/api/auth/me").then().statusCode(401);
	}

	@Test
	void wrongRoleGets403() {
		given().auth().oauth2(tokenFor("bogdan_employee@staffsync.local"))
			.when().get("/api/test/pm-only")
			.then()
			.statusCode(403)
			.body("code", equalTo("FORBIDDEN"));
	}

	@Test
	void rightRolePassesMethodSecurity() {
		given().auth().oauth2(tokenFor("mateja_pm@staffsync.local"))
			.when().get("/api/test/pm-only")
			.then()
			.statusCode(200);
	}

	@Test
	void tokenOfAUserDeactivatedAfterLoginIs401() {
		String token = tokenFor("mateja_pm@staffsync.local");
		User pm = userRepository.findByEmailIgnoreCase("mateja_pm@staffsync.local").orElseThrow();
		pm.setActive(false);
		userRepository.save(pm);
		try {
			given().auth().oauth2(token).when().get("/api/test/pm-only").then().statusCode(401);
			given().auth().oauth2(token).when().get("/api/auth/me").then().statusCode(401);
		}
		finally {
			pm.setActive(true);
			userRepository.save(pm);
		}
	}

	@Test
	void tokenWhoseRoleChangedSinceLoginIs401() {
		String token = tokenFor("mateja_pm@staffsync.local");
		User pm = userRepository.findByEmailIgnoreCase("mateja_pm@staffsync.local").orElseThrow();
		pm.setRole(Role.EMPLOYEE);
		userRepository.save(pm);
		try {
			given().auth().oauth2(token).when().get("/api/test/pm-only").then().statusCode(401);
		}
		finally {
			pm.setRole(Role.PM);
			userRepository.save(pm);
		}
	}

	private Response login(String email, String password) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", password))
			.when().post("/api/auth/login");
	}

	private String tokenFor(String email) {
		return login(email, PASSWORD).then().statusCode(200).extract().path("token");
	}

	/** Proves the {@code @PreAuthorize("hasRole(...)")} convention works. */
	@RestController
	static class PmOnlyController {

		@PreAuthorize("hasRole('PM')")
		@GetMapping("/api/test/pm-only")
		String pmOnly() {
			return "ok";
		}

	}

}
