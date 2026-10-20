package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;

import java.util.Map;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OpenApiDocsTests {

	@LocalServerPort
	int port;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void apiDocsHaveTitleVersionAndBearerScheme() {
		given()
			.when().get("/v3/api-docs")
			.then()
			.statusCode(200)
			.body("info.title", equalTo("StaffSync API"))
			.body("info.version", equalTo("v1"))
			.body("components.securitySchemes.bearerAuth.type", equalTo("http"))
			.body("components.securitySchemes.bearerAuth.scheme", equalTo("bearer"))
			.body("components.securitySchemes.bearerAuth.bearerFormat", equalTo("JWT"));
	}

	@Test
	void protectedEndpointsReferenceTheBearerScheme() {
		given()
			.when().get("/v3/api-docs")
			.then()
			.statusCode(200)
			.body("paths.'/api/auth/me'.get.security[0]", hasKey("bearerAuth"));
	}

	// T-39
	@Test
	void swaggerUiOpensWithoutAToken() {
		given()
			.when().get("/swagger-ui.html")
			.then()
			.statusCode(200)
			.body(containsString("Swagger UI"));
	}

	// T-39
	@Test
	void protectedEndpointIs401WithoutAuthorizeAnd200WithTheLoginToken() {
		given().when().get("/api/auth/me").then().statusCode(401);

		String token = given().contentType(ContentType.JSON)
			.body(Map.of("email", "mateja_pm@staffsync.local", "password", "Password123!"))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");

		given().header("Authorization", "Bearer " + token)
			.when().get("/api/auth/me")
			.then()
			.statusCode(200)
			.body("email", equalTo("mateja_pm@staffsync.local"));
	}

}
