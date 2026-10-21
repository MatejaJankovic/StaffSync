package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.AfterEach;
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
class EmployeeSkillControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	private static final String EMPLOYEE = "bogdan_employee@staffsync.local";

	@LocalServerPort
	int port;

	private String employeeToken;

	private long employeeId;

	private int java;

	private int spring;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
		employeeToken = tokenFor(EMPLOYEE);
		employeeId = given().auth().oauth2(employeeToken)
			.when().get("/api/auth/me")
			.then().statusCode(200)
			.extract().jsonPath().getLong("id");
		java = skillId("Java");
		spring = skillId("Spring");
	}

	// Tests share one database, so leave the employee without skills
	@AfterEach
	void clearSkills() {
		put(tokenFor(ADMIN), employeeId, List.of()).then().statusCode(200);
	}

	@ParameterizedTest
	@ValueSource(strings = { ADMIN, "mateja_pm@staffsync.local", "lazar_rm@staffsync.local", EMPLOYEE })
	void everyRoleCanReadAnEmployeesSkills(String email) {
		put(employeeToken, employeeId, List.of(skill(java, 4, 3))).then().statusCode(200);

		given().auth().oauth2(tokenFor(email))
			.when().get(skillsUrl(employeeId))
			.then()
			.statusCode(200)
			.body("skillName", contains("Java"))
			.body("[0].skillId", equalTo(java))
			.body("[0].category", equalTo("BACKEND"))
			.body("[0].level", equalTo(4))
			.body("[0].yearsOfExperience", equalTo(3));
	}

	@Test
	void readingWithoutTokenIs401() {
		given().when().get(skillsUrl(employeeId)).then().statusCode(401);
	}

	@Test
	void employeeReplacesTheirOwnSkillList() {
		put(employeeToken, employeeId, List.of(skill(java, 4, 3), skill(spring, 2, 1))).then().statusCode(200);

		// Java changes level, Spring is removed, and the change survives a new read
		put(employeeToken, employeeId, List.of(skill(java, 5, 4))).then()
			.statusCode(200)
			.body("skillName", contains("Java"))
			.body("[0].level", equalTo(5));

		given().auth().oauth2(employeeToken)
			.when().get(skillsUrl(employeeId))
			.then()
			.statusCode(200)
			.body("skillName", contains("Java"))
			.body("[0].level", equalTo(5))
			.body("[0].yearsOfExperience", equalTo(4));
	}

	@Test
	void removingASkillAndAddingItBackInTheSameListWorks() {
		put(employeeToken, employeeId, List.of(skill(java, 3, 1))).then().statusCode(200);
		put(employeeToken, employeeId, List.of(skill(spring, 3, 1), skill(java, 4, 2))).then()
			.statusCode(200)
			.body("skillName", contains("Java", "Spring"));
	}

	@Test
	void anEmptyListRemovesEverySkill() {
		put(employeeToken, employeeId, List.of(skill(java, 4, 3))).then().statusCode(200);

		put(employeeToken, employeeId, List.of()).then().statusCode(200).body("size()", equalTo(0));
	}

	@Test
	void adminCanReplaceAnEmployeesSkills() {
		put(tokenFor(ADMIN), employeeId, List.of(skill(java, 3, 2))).then()
			.statusCode(200)
			.body("skillName", contains("Java"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "lazar_rm@staffsync.local" })
	void nobodyElseCanReplaceAnEmployeesSkills(String email) {
		put(tokenFor(email), employeeId, List.of(skill(java, 3, 2))).then()
			.statusCode(403)
			.body("code", equalTo("FORBIDDEN"));
	}

	@Test
	void anEmployeeCannotReplaceSomeoneElsesSkills() {
		long adminId = given().auth().oauth2(tokenFor(ADMIN)).when().get("/api/auth/me").then()
			.extract().jsonPath().getLong("id");

		put(employeeToken, adminId, List.of(skill(java, 3, 2))).then().statusCode(403).body("code", equalTo("FORBIDDEN"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, 6 })
	void levelOutside1To5Is400(int level) {
		put(employeeToken, employeeId, List.of(skill(java, level, 1))).then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("level"));
	}

	@Test
	void negativeYearsOfExperienceIs400() {
		put(employeeToken, employeeId, List.of(skill(java, 3, -1))).then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("yearsOfExperience"));
	}

	@Test
	void missingFieldsAre400() {
		put(employeeToken, employeeId, List.of(Map.of())).then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"));
	}

	@Test
	void theSameSkillTwiceIs400() {
		put(employeeToken, employeeId, List.of(skill(java, 3, 1), skill(java, 4, 2))).then()
			.statusCode(400)
			.body("code", equalTo("DUPLICATE_SKILL"))
			.body("details", contains(java));
	}

	@Test
	void aSkillNotInTheCatalogIs400() {
		put(employeeToken, employeeId, List.of(skill(999_999, 3, 1))).then()
			.statusCode(400)
			.body("code", equalTo("UNKNOWN_SKILL"));
	}

	@Test
	void unknownUserIs404() {
		String admin = tokenFor(ADMIN);
		given().auth().oauth2(admin).when().get(skillsUrl(999_999)).then().statusCode(404).body("code",
				equalTo("NOT_FOUND"));
		put(admin, 999_999, List.of()).then().statusCode(404).body("code", equalTo("NOT_FOUND"));
	}

	@Test
	void aRatedSkillCannotBeDeletedFromTheCatalog() {
		String admin = tokenFor(ADMIN);
		int skillId = given().auth().oauth2(admin)
			.contentType(ContentType.JSON)
			.body(Map.of("name", "Rated-" + UUID.randomUUID().toString().substring(0, 8), "category", "OTHER"))
			.when().post("/api/skills")
			.then().statusCode(201)
			.extract().path("id");
		put(employeeToken, employeeId, List.of(skill(skillId, 2, 1))).then().statusCode(200);

		given().auth().oauth2(admin).when().delete("/api/skills/" + skillId).then().statusCode(409).body("code",
				equalTo("SKILL_IN_USE"));

		put(employeeToken, employeeId, List.of()).then().statusCode(200);
		given().auth().oauth2(admin).when().delete("/api/skills/" + skillId).then().statusCode(204);
	}

	@Test
	void meIncludesThePersonalDataForMyProfile() {
		given().auth().oauth2(employeeToken)
			.when().get("/api/auth/me")
			.then()
			.statusCode(200)
			.body("department", equalTo("Engineering"))
			.body("seniority", equalTo("MEDIOR"))
			.body("capacityPercent", equalTo(100))
			.body("manager.firstName", equalTo("Lazar"))
			.body("manager.lastName", equalTo("Dunjic"));
	}

	private static Map<String, Object> skill(int skillId, int level, int years) {
		return Map.of("skillId", skillId, "level", level, "yearsOfExperience", years);
	}

	private static String skillsUrl(long userId) {
		return "/api/users/" + userId + "/skills";
	}

	private static Response put(String token, long userId, List<?> body) {
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(body).when().put(skillsUrl(userId));
	}

	private int skillId(String name) {
		return given().auth().oauth2(employeeToken)
			.when().get("/api/skills")
			.then().statusCode(200)
			.extract().jsonPath().getInt("find { it.name == '" + name + "' }.id");
	}

	private String tokenFor(String email) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");
	}

}
