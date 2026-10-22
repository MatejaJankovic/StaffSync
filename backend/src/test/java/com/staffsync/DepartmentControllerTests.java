package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DepartmentControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	@LocalServerPort
	int port;

	@Autowired
	DepartmentRepository departmentRepository;

	@Autowired
	UserRepository userRepository;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@ParameterizedTest
	@ValueSource(strings = { "vukasin_admin@staffsync.local", "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void everyRoleCanReadTheDepartments(String email) {
		given().auth().oauth2(tokenFor(email))
			.when().get("/api/departments")
			.then()
			.statusCode(200)
			.body("name", hasItem("Engineering"));
	}

	@Test
	void readingWithoutTokenIs401() {
		given().when().get("/api/departments").then().statusCode(401);
	}

	@Test
	void listIsOrderedByName() {
		String token = tokenFor(ADMIN);
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		// Created in reverse order, so the list can't just be in insertion order
		int second = createDepartment(token, "Order-B-" + suffix);
		int first = createDepartment(token, "Order-A-" + suffix);

		try {
			List<Integer> ids = given().auth().oauth2(token)
				.when().get("/api/departments")
				.then().statusCode(200)
				.extract().jsonPath().getList("id");

			assertThat(ids).containsSubsequence(first, second);
		}
		finally {
			// Also when the assertion fails, so the rows don't leak into the other tests
			deleteDepartment(token, first);
			deleteDepartment(token, second);
		}
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void onlyAdminCanWrite(String email) {
		String token = tokenFor(email);
		Map<String, String> body = Map.of("name", uniqueName());

		given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().post("/api/departments")
			.then().statusCode(403).body("code", equalTo("FORBIDDEN"));
		given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().put("/api/departments/1")
			.then().statusCode(403);
		given().auth().oauth2(token)
			.when().delete("/api/departments/1")
			.then().statusCode(403);
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
			"bogdan_employee@staffsync.local" })
	void nonAdminWithAnInvalidBodyGets403NotValidationErrors(String email) {
		String token = tokenFor(email);
		Map<String, String> invalid = Map.of("name", "");

		given().auth().oauth2(token).contentType(ContentType.JSON).body(invalid)
			.when().post("/api/departments")
			.then().statusCode(403);
		given().auth().oauth2(token).contentType(ContentType.JSON).body(invalid)
			.when().put("/api/departments/1")
			.then().statusCode(403);
	}

	@Test
	void writingWithoutTokenIs401() {
		given().contentType(ContentType.JSON).body(Map.of("name", uniqueName()))
			.when().post("/api/departments")
			.then().statusCode(401);
	}

	@Test
	void adminCreatesRenamesAndDeletesADepartment() {
		String token = tokenFor(ADMIN);
		String name = uniqueName();

		int id = given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "  " + name + "  "))
			.when().post("/api/departments")
			.then()
			.statusCode(201)
			.body("id", notNullValue())
			.body("name", equalTo(name))
			.extract().path("id");

		String renamed = uniqueName();
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", renamed))
			.when().put("/api/departments/" + id)
			.then()
			.statusCode(200)
			.body("id", equalTo(id))
			.body("name", equalTo(renamed));

		given().auth().oauth2(token)
			.when().get("/api/departments/" + id)
			.then().statusCode(200).body("name", equalTo(renamed));

		deleteDepartment(token, id);

		given().auth().oauth2(token)
			.when().get("/api/departments/" + id)
			.then().statusCode(404).body("code", equalTo("NOT_FOUND"));
	}

	@Test
	void duplicateNameOnCreateIs409EvenWithDifferentCase() {
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", "engineering"))
			.when().post("/api/departments")
			.then()
			.statusCode(409)
			.body("code", equalTo("DEPARTMENT_NAME_TAKEN"))
			.body("message", equalTo("A department named 'engineering' already exists"));
	}

	@Test
	void renamingToAnExistingNameIs409ButKeepingOwnNameIsFine() {
		String token = tokenFor(ADMIN);
		String name = uniqueName();
		int id = createDepartment(token, name);

		try {
			given().auth().oauth2(token).contentType(ContentType.JSON)
				.body(Map.of("name", "ENGINEERING"))
				.when().put("/api/departments/" + id)
				.then().statusCode(409).body("code", equalTo("DEPARTMENT_NAME_TAKEN"));

			// Saving the same name again, or only changing its case, is not a duplicate of itself
			given().auth().oauth2(token).contentType(ContentType.JSON)
				.body(Map.of("name", name.toUpperCase()))
				.when().put("/api/departments/" + id)
				.then().statusCode(200).body("name", equalTo(name.toUpperCase()));
		}
		finally {
			deleteDepartment(token, id);
		}
	}

	@Test
	void deletingADepartmentWithUsersIs409() {
		String token = tokenFor(ADMIN);
		int engineering = given().auth().oauth2(token)
			.when().get("/api/departments")
			.then().statusCode(200)
			.extract().jsonPath().getInt("find { it.name == 'Engineering' }.id");

		given().auth().oauth2(token)
			.when().delete("/api/departments/" + engineering)
			.then()
			.statusCode(409)
			.body("code", equalTo("DEPARTMENT_IN_USE"))
			.body("message", equalTo("Department 'Engineering' still has users and cannot be deleted"));

		given().auth().oauth2(token)
			.when().get("/api/departments/" + engineering)
			.then().statusCode(200);
	}

	/** The decision of US-17: a deactivated user still belongs to their department, so it can't be deleted. */
	@Test
	void deletingADepartmentWithOnlyADeactivatedUserIs409() {
		String token = tokenFor(ADMIN);
		Department department = departmentRepository.save(new Department(uniqueName()));
		User user = new User("inactive-" + UUID.randomUUID() + "@staffsync.local", "not-a-real-hash", "Former",
				"Employee", Role.EMPLOYEE);
		user.setDepartment(department);
		user.setActive(false);
		user = userRepository.save(user);

		try {
			given().auth().oauth2(token)
				.when().delete("/api/departments/" + department.getId())
				.then()
				.statusCode(409)
				.body("code", equalTo("DEPARTMENT_IN_USE"));
		}
		finally {
			userRepository.delete(user);
			departmentRepository.delete(department);
		}
	}

	@Test
	void invalidBodiesAre400() {
		String token = tokenFor(ADMIN);

		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "   "))
			.when().post("/api/departments")
			.then().statusCode(400).body("code", equalTo("VALIDATION_ERROR"));
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "x".repeat(101)))
			.when().post("/api/departments")
			.then().statusCode(400);
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of())
			.when().post("/api/departments")
			.then().statusCode(400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "a\nb", "tab\there", "bell\u0007", "<script>\r\n" })
	void nameWithControlCharactersIs400(String name) {
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(Map.of("name", name))
			.when().post("/api/departments")
			.then().statusCode(400);
	}

	@Test
	void renamingWithAnInvalidNameIs400() {
		String token = tokenFor(ADMIN);
		int id = createDepartment(token, uniqueName());

		try {
			for (String invalid : List.of("   ", "x".repeat(101), "a\nb")) {
				given().auth().oauth2(token).contentType(ContentType.JSON)
					.body(Map.of("name", invalid))
					.when().put("/api/departments/" + id)
					.then().statusCode(400).body("code", equalTo("VALIDATION_ERROR"));
			}
		}
		finally {
			deleteDepartment(token, id);
		}
	}

	@Test
	void missingDepartmentIs404() {
		String token = tokenFor(ADMIN);

		given().auth().oauth2(token).when().get("/api/departments/999999").then().statusCode(404);
		given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", uniqueName()))
			.when().put("/api/departments/999999").then().statusCode(404);
		given().auth().oauth2(token).when().delete("/api/departments/999999").then().statusCode(404);
	}

	private int createDepartment(String token, String name) {
		return given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", name))
			.when().post("/api/departments")
			.then().statusCode(201).extract().path("id");
	}

	private void deleteDepartment(String token, int id) {
		given().auth().oauth2(token).when().delete("/api/departments/" + id).then().statusCode(204);
	}

	private static String uniqueName() {
		return "Dept-" + UUID.randomUUID().toString().substring(0, 8);
	}

	private String tokenFor(String email) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200).extract().path("token");
	}

}
