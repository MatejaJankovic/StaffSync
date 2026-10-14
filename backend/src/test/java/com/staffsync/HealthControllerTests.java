package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthControllerTests {

	@LocalServerPort
	int port;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void healthIsPublicAndReportsDatabaseUp() {
		given()
			.when().get("/api/health")
			.then()
			.statusCode(200)
			.body("status", equalTo("UP"))
			.body("database", equalTo("UP"));
	}

	@Test
	void openApiDocsArePublic() {
		given()
			.when().get("/v3/api-docs")
			.then()
			.statusCode(200);
	}

	@Test
	void otherEndpointsRequireAuthentication() {
		given()
			.when().get("/api/users")
			.then()
			.statusCode(401);
	}

}
