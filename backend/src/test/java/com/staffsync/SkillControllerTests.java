package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.notNullValue;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SkillControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	@LocalServerPort
	int port;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void flywaySeedsTheCatalogWithTheDemoSkills() {
		given().auth().oauth2(tokenFor(ADMIN))
			.when().get("/api/skills")
			.then()
			.statusCode(200)
			.body("size()", greaterThanOrEqualTo(25))
			.body("name", hasItems("Java", "Spring", "PostgreSQL"));
	}

	@Test
	void listIsOrderedByCategoryThenName() {
		List<String> categories = given().auth().oauth2(tokenFor(ADMIN))
			.when().get("/api/skills")
			.then()
			.statusCode(200)
			.extract().jsonPath().getList("category");

		List<String> sorted = categories.stream().sorted().toList();
		assertThat(categories).isEqualTo(sorted);
	}

	@Test
	void skillsInTheSameCategoryAreOrderedByName() {
		String token = tokenFor(ADMIN);
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		// Created in reverse order, so the list can't just be in insertion order
		int second = createSkill(token, "Order-B-" + suffix, "OTHER");
		int first = createSkill(token, "Order-A-" + suffix, "OTHER");

		List<Integer> ids = given().auth().oauth2(token)
			.queryParam("category", "OTHER")
			.when().get("/api/skills")
			.then().statusCode(200)
			.extract().jsonPath().getList("id");

		assertThat(ids).containsSubsequence(first, second);

		given().auth().oauth2(token).when().delete("/api/skills/" + first).then().statusCode(204);
		given().auth().oauth2(token).when().delete("/api/skills/" + second).then().statusCode(204);
	}

	@Test
	void listCanBeFilteredByCategory() {
		given().auth().oauth2(tokenFor(ADMIN))
			.queryParam("category", "DATABASE")
			.when().get("/api/skills")
			.then()
			.statusCode(200)
			.body("category", everyItem(equalTo("DATABASE")))
			.body("name", hasItems("PostgreSQL", "MySQL"));
	}

	@Test
	void unknownCategoryFilterIs400() {
		given().auth().oauth2(tokenFor(ADMIN))
			.queryParam("category", "COOKING")
			.when().get("/api/skills")
			.then()
			.statusCode(400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "vukasin_admin@staffsync.local", "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void everyRoleCanReadTheCatalog(String email) {
		given().auth().oauth2(tokenFor(email)).when().get("/api/skills").then().statusCode(200);
	}

	@Test
	void readingWithoutTokenIs401() {
		given().when().get("/api/skills").then().statusCode(401);
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void onlyAdminCanWrite(String email) {
		String token = tokenFor(email);
		Map<String, String> body = Map.of("name", uniqueName(), "category", "OTHER");

		given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().post("/api/skills")
			.then().statusCode(403).body("code", equalTo("FORBIDDEN"));
		given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().put("/api/skills/1")
			.then().statusCode(403);
		given().auth().oauth2(token)
			.when().delete("/api/skills/1")
			.then().statusCode(403);
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void nonAdminWithAnInvalidBodyGets403NotValidationErrors(String email) {
		String token = tokenFor(email);
		Map<String, String> invalid = Map.of("name", "", "category", "COOKING");

		given().auth().oauth2(token).contentType(ContentType.JSON).body(invalid)
			.when().post("/api/skills")
			.then().statusCode(403);
		given().auth().oauth2(token).contentType(ContentType.JSON).body(invalid)
			.when().put("/api/skills/1")
			.then().statusCode(403);
	}

	@Test
	void writingWithoutTokenIs401() {
		given().contentType(ContentType.JSON).body(Map.of("name", uniqueName(), "category", "OTHER"))
			.when().post("/api/skills")
			.then().statusCode(401);
	}

	@Test
	void adminCreatesUpdatesAndDeletesASkill() {
		RequestSpecification admin = given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON);
		String name = uniqueName();

		int id = admin.body(Map.of("name", "  " + name + "  ", "category", "BACKEND"))
			.when().post("/api/skills")
			.then()
			.statusCode(201)
			.body("id", notNullValue())
			.body("name", equalTo(name))
			.body("category", equalTo("BACKEND"))
			.extract().path("id");

		String renamed = uniqueName();
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", renamed, "category", "QA"))
			.when().put("/api/skills/" + id)
			.then()
			.statusCode(200)
			.body("name", equalTo(renamed))
			.body("category", equalTo("QA"));

		given().auth().oauth2(tokenFor(ADMIN))
			.when().get("/api/skills/" + id)
			.then().statusCode(200).body("name", equalTo(renamed));

		given().auth().oauth2(tokenFor(ADMIN))
			.when().delete("/api/skills/" + id)
			.then().statusCode(204);

		given().auth().oauth2(tokenFor(ADMIN))
			.when().get("/api/skills/" + id)
			.then().statusCode(404).body("code", equalTo("SKILL_NOT_FOUND"));
	}

	@Test
	void duplicateNameOnCreateIs409EvenWithDifferentCase() {
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", "java", "category", "BACKEND"))
			.when().post("/api/skills")
			.then()
			.statusCode(409)
			.body("code", equalTo("SKILL_NAME_TAKEN"))
			.body("message", equalTo("A skill named 'java' already exists"));
	}

	@Test
	void renamingToAnExistingNameIs409ButKeepingOwnNameIsFine() {
		String token = tokenFor(ADMIN);
		String name = uniqueName();
		int id = given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", name, "category", "OTHER"))
			.when().post("/api/skills")
			.then().statusCode(201).extract().path("id");

		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "Spring", "category", "OTHER"))
			.when().put("/api/skills/" + id)
			.then().statusCode(409).body("code", equalTo("SKILL_NAME_TAKEN"));

		// Only the category changes, the name stays as it is
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", name, "category", "DEVOPS"))
			.when().put("/api/skills/" + id)
			.then().statusCode(200).body("category", equalTo("DEVOPS"));

		given().auth().oauth2(token).when().delete("/api/skills/" + id).then().statusCode(204);
	}

	@Test
	void invalidBodiesAre400() {
		RequestSpecification admin = given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON);

		admin.body(Map.of("name", "   ", "category", "OTHER")).when().post("/api/skills").then().statusCode(400);
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", "x".repeat(101), "category", "OTHER"))
			.when().post("/api/skills").then().statusCode(400);
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", uniqueName()))
			.when().post("/api/skills").then().statusCode(400);
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", uniqueName(), "category", "COOKING"))
			.when().post("/api/skills").then().statusCode(400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "a\nb", "tab\there", "bell\u0007", "<script>\r\n" })
	void nameWithControlCharactersIs400(String name) {
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", name, "category", "OTHER"))
			.when().post("/api/skills")
			.then().statusCode(400);
	}

	@Test
	void missingSkillIs404() {
		String token = tokenFor(ADMIN);

		given().auth().oauth2(token).when().get("/api/skills/999999").then().statusCode(404);
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", uniqueName(), "category", "OTHER"))
			.when().put("/api/skills/999999").then().statusCode(404);
		given().auth().oauth2(token).when().delete("/api/skills/999999").then().statusCode(404);
	}

	private int createSkill(String token, String name, String category) {
		return given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", name, "category", category))
			.when().post("/api/skills")
			.then().statusCode(201).extract().path("id");
	}

	private static String uniqueName() {
		return "Skill-" + UUID.randomUUID().toString().substring(0, 8);
	}

	private String tokenFor(String email) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200).extract().path("token");
	}

}
