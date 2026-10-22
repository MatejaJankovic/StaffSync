package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import java.util.HashMap;
import java.util.Map;

import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/** {@code PUT /api/auth/password} (US-19). Works on its own user, so the seeded passwords never change. */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChangePasswordTests {

	private static final String EMAIL = "password_change@staffsync.local";

	private static final String OLD_PASSWORD = "Temporary123!";

	private static final String NEW_PASSWORD = "MyNewPassword2026!";

	@LocalServerPort
	int port;

	@Autowired
	UserRepository userRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
		userRepository.save(new User(EMAIL, passwordEncoder.encode(OLD_PASSWORD), "Pera", "Peric", Role.EMPLOYEE));
	}

	@AfterEach
	void tearDown() {
		userRepository.findByEmailIgnoreCase(EMAIL).ifPresent(userRepository::delete);
	}

	@Test
	void changesThePasswordSoOnlyTheNewOneLogsIn() {
		changePassword(token(), OLD_PASSWORD, NEW_PASSWORD).then().statusCode(204);

		login(NEW_PASSWORD).then().statusCode(200);
		login(OLD_PASSWORD).then().statusCode(401);
	}

	@Test
	void storesTheNewPasswordAsBcrypt() {
		changePassword(token(), OLD_PASSWORD, NEW_PASSWORD).then().statusCode(204);

		String hash = userRepository.findByEmailIgnoreCase(EMAIL).orElseThrow().getPasswordHash();
		assertThat(hash).startsWith("$2a$").isNotEqualTo(NEW_PASSWORD);
		assertThat(passwordEncoder.matches(NEW_PASSWORD, hash)).isTrue();
	}

	// T-38
	@Test
	void wrongOldPasswordIs400AndKeepsThePassword() {
		changePassword(token(), "not-my-password", NEW_PASSWORD)
			.then()
			.statusCode(400)
			.body("code", equalTo("WRONG_PASSWORD"))
			.body("message", equalTo("Current password is incorrect"));

		login(OLD_PASSWORD).then().statusCode(200);
	}

	@Test
	void newPasswordShorterThan8Is400() {
		changePassword(token(), OLD_PASSWORD, "Short7!")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("newPassword"));

		login(OLD_PASSWORD).then().statusCode(200);
	}

	@Test
	void newPasswordLongerThan72Is400() {
		changePassword(token(), OLD_PASSWORD, "x".repeat(73))
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("newPassword"));
	}

	@Test
	void missingFieldsAre400() {
		changePassword(token(), null, null)
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("oldPassword"))
			.body("details.field", hasItem("newPassword"));
	}

	@Test
	void withoutTokenIs401() {
		given().contentType(ContentType.JSON)
			.body(Map.of("oldPassword", OLD_PASSWORD, "newPassword", NEW_PASSWORD))
			.when().put("/api/auth/password")
			.then()
			.statusCode(401);

		login(OLD_PASSWORD).then().statusCode(200);
	}

	private Response changePassword(String token, String oldPassword, String newPassword) {
		// Map.of() rejects nulls
		Map<String, String> body = new HashMap<>();
		body.put("oldPassword", oldPassword);
		body.put("newPassword", newPassword);
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(body).when().put("/api/auth/password");
	}

	private Response login(String password) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", EMAIL, "password", password))
			.when().post("/api/auth/login");
	}

	private String token() {
		return login(OLD_PASSWORD).then().statusCode(200).extract().path("token");
	}

}
