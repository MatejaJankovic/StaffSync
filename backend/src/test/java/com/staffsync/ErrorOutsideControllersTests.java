package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.util.Map;

import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** Errors that happen before a controller is reached still use the standard error format. */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ErrorOutsideControllersTests {

	@LocalServerPort
	int port;

	@MockitoSpyBean
	UserRepository userRepository;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void databaseFailureInTheJwtFilterIs500InTheStandardFormat() {
		String token = given().contentType(ContentType.JSON)
			.body(Map.of("email", "bogdan_employee@staffsync.local", "password", "Password123!"))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");
		// The filter looks the user up for every request with a token
		doThrow(new DataAccessResourceFailureException("secret connection detail")).when(userRepository)
			.findById(any());

		given().auth().oauth2(token)
			.when().get("/api/auth/me")
			.then()
			.statusCode(500)
			.contentType(ContentType.JSON)
			.body("timestamp", notNullValue())
			.body("status", equalTo(500))
			.body("code", equalTo("INTERNAL_ERROR"))
			.body("message", equalTo("An unexpected error occurred"))
			.body("details", empty())
			.body("path", equalTo(null))
			.body(not(containsString("secret connection detail")));
	}

	@Test
	void errorPageWithoutAnErrorIs500InTheStandardFormat() {
		given()
			.when().get("/error")
			.then()
			.statusCode(500)
			.body("code", equalTo("INTERNAL_ERROR"));
	}

}
