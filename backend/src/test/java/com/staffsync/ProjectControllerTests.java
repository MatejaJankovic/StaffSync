package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.project.ProjectStatus;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.ValidatableResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProjectControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String PM = "mateja_pm@staffsync.local";

	private static final String RM = "lazar_rm@staffsync.local";

	private static final String EMPLOYEE = "bogdan_employee@staffsync.local";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	@LocalServerPort
	int port;

	@Autowired
	UserRepository userRepository;

	@Autowired
	ProjectRepository projectRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void pmCreatesAProjectOwnedByThemselvesWithStatusPlanned() {
		LoggedIn pm = login(PM);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(body("Project Alpha", "Acme Corp", "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(201)
			.body("id", notNullValue())
			.body("name", equalTo("Project Alpha"))
			.body("client", equalTo("Acme Corp"))
			.body("description", equalTo("Customer portal"))
			.body("startDate", equalTo("2026-11-01"))
			.body("endDate", equalTo("2027-03-31"))
			.body("status", equalTo("PLANNED"))
			.body("pmId", equalTo(pm.id()))
			.body("pmName", equalTo("Mateja Jankovic"));
	}

	@Test
	void theClientCannotChooseTheOwnerOrTheStatus() {
		LoggedIn pm = login(PM);
		LoggedIn other = newPm();
		Map<String, Object> body = body("Sneaky", "Acme", "2026-11-01", "2027-03-31");
		body.put("pmId", other.id());
		body.put("status", "ACTIVE");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects")
			.then()
			.statusCode(201)
			.body("pmId", equalTo(pm.id()))
			.body("status", equalTo("PLANNED"));
	}

	@Test
	void descriptionIsOptionalAndBlankBecomesNull() {
		Map<String, Object> body = body("  No description  ", "  Acme  ", "2026-11-01", "2026-11-01");
		body.put("description", "   ");

		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects")
			.then()
			.statusCode(201)
			.body("name", equalTo("No description"))
			.body("client", equalTo("Acme"))
			.body("description", nullValue());
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void onlyAPmCanCreateAProject(String email) {
		given().auth().oauth2(login(email).token()).contentType(ContentType.JSON)
			.body(body("Project", "Acme", "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(403)
			.body("code", equalTo("FORBIDDEN"));
	}

	@Test
	void aNonPmGets403EvenWithAnInvalidBody() {
		given().auth().oauth2(login(RM).token()).contentType(ContentType.JSON)
			.body(Map.of("name", ""))
			.when().post("/api/projects")
			.then()
			.statusCode(403);
	}

	@Test
	void creatingWithoutATokenIs401() {
		given().contentType(ContentType.JSON)
			.body(body("Project", "Acme", "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(401);
	}

	@Test
	void requiredFieldsAreValidated() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(Map.of("name", "   ", "description", "x".repeat(2001)))
			.when().post("/api/projects")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", org.hamcrest.Matchers.containsInAnyOrder("name", "client", "description",
					"startDate", "endDate"));
	}

	@Test
	void nameAndClientHaveALengthLimit() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("n".repeat(201), "c".repeat(201), "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(400)
			.body("details.field", org.hamcrest.Matchers.containsInAnyOrder("name", "client"));
	}

	// BR-3 (start ≤ end)
	@Test
	void startAfterEndIs400OnCreate() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("Project", "Acme", "2027-03-31", "2026-11-01"))
			.when().post("/api/projects")
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void aOneDayProjectIsAllowed() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("One day", "Acme", "2026-11-02", "2026-11-02"))
			.when().post("/api/projects")
			.then()
			.statusCode(201);
	}

	@Test
	void malformedDateIs400() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("Project", "Acme", "not-a-date", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(400);
	}

	@ParameterizedTest
	@ValueSource(strings = { PM, RM, EMPLOYEE, ADMIN })
	void everyRoleCanListAndReadProjects(String email) {
		String token = login(email).token();
		int id = createProject(login(PM).token(), "Readable-" + UUID.randomUUID());

		given().auth().oauth2(token).when().get("/api/projects").then().statusCode(200)
			.body("content", notNullValue());
		given().auth().oauth2(token).when().get("/api/projects/" + id).then().statusCode(200)
			.body("id", equalTo(id));
	}

	@Test
	void readingWithoutATokenIs401() {
		given().when().get("/api/projects").then().statusCode(401);
		given().when().get("/api/projects/1").then().statusCode(401);
	}

	@Test
	void listIsPagedWithTheStandardShape() {
		String token = login(PM).token();
		String prefix = "Paged-" + UUID.randomUUID().toString().substring(0, 8);
		for (int i = 1; i <= 3; i++) {
			createProject(token, prefix + "-" + i);
		}

		// Sorted by name by default, so these three come out in order, however many projects exist
		List<String> names = given().auth().oauth2(token)
			.queryParam("size", 100)
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("page.size", equalTo(100))
			.body("page.number", equalTo(0))
			.body("page.totalElements", notNullValue())
			.body("page.totalPages", notNullValue())
			.extract().jsonPath().getList("content.name");
		assertThat(names).containsSubsequence(prefix + "-1", prefix + "-2", prefix + "-3");

		given().auth().oauth2(token)
			.queryParam("size", 2)
			.queryParam("page", 1)
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("content", hasSize(2))
			.body("page.size", equalTo(2))
			.body("page.number", equalTo(1));
	}

	@Test
	void listCanBeSortedByAProperty() {
		String token = login(PM).token();
		String prefix = "Sorted-" + UUID.randomUUID().toString().substring(0, 8);
		createProject(token, prefix + "-a");
		createProject(token, prefix + "-b");

		List<String> names = given().auth().oauth2(token)
			.queryParam("sort", "name,desc")
			.queryParam("size", 100)
			.when().get("/api/projects")
			.then().statusCode(200)
			.extract().jsonPath().getList("content.name");

		assertThat(names).containsSubsequence(prefix + "-b", prefix + "-a");
	}

	@Test
	void sortingByAnUnknownPropertyIs400NotA500() {
		given().auth().oauth2(login(PM).token())
			.queryParam("sort", "passwordHash,asc")
			.when().get("/api/projects")
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_SORT"));
	}

	@Test
	void listCanBeFilteredByPm() {
		LoggedIn pm = login(PM);
		LoggedIn other = newPm();
		createProject(pm.token(), "Mine-" + UUID.randomUUID());
		int theirs = createProject(other.token(), "Theirs-" + UUID.randomUUID());

		given().auth().oauth2(pm.token())
			.queryParam("pmId", other.id())
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("content.id", contains(theirs))
			.body("content.pmId", everyItem(equalTo(other.id())));

		given().auth().oauth2(pm.token())
			.queryParam("pmId", pm.id())
			.queryParam("size", 100)
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("content.pmId", everyItem(equalTo(pm.id())))
			.body("content.id", org.hamcrest.Matchers.not(hasItem(theirs)));
	}

	@Test
	void listCanBeFilteredByStatus() {
		LoggedIn pm = newPm();
		int planned = createProject(pm.token(), "Planned-" + UUID.randomUUID());
		int active = createProject(pm.token(), "Active-" + UUID.randomUUID());
		setStatus(active, ProjectStatus.ACTIVE);

		given().auth().oauth2(pm.token())
			.queryParam("pmId", pm.id())
			.queryParam("status", "ACTIVE")
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("content.id", contains(active))
			.body("content.status", everyItem(equalTo("ACTIVE")));

		given().auth().oauth2(pm.token())
			.queryParam("pmId", pm.id())
			.queryParam("status", "PLANNED")
			.when().get("/api/projects")
			.then()
			.statusCode(200)
			.body("content.id", contains(planned));
	}

	@Test
	void unknownStatusFilterIs400() {
		given().auth().oauth2(login(PM).token())
			.queryParam("status", "DONE")
			.when().get("/api/projects")
			.then()
			.statusCode(400);
	}

	@Test
	void unknownProjectIs404() {
		given().auth().oauth2(login(PM).token())
			.when().get("/api/projects/999999")
			.then()
			.statusCode(404)
			.body("code", equalTo("NOT_FOUND"));
	}

	@Test
	void theOwnerCanEditTheirProject() {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Before-" + UUID.randomUUID());
		setStatus(id, ProjectStatus.ACTIVE);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(body("After", "New client", "2026-12-01", "2027-06-30"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(200)
			.body("id", equalTo(id))
			.body("name", equalTo("After"))
			.body("client", equalTo("New client"))
			.body("startDate", equalTo("2026-12-01"))
			.body("endDate", equalTo("2027-06-30"))
			// The status and the owner are not part of an edit
			.body("status", equalTo("ACTIVE"))
			.body("pmId", equalTo(pm.id()));

		given().auth().oauth2(pm.token())
			.when().get("/api/projects/" + id)
			.then()
			.statusCode(200)
			.body("name", equalTo("After"));
	}

	// BR-4
	@Test
	void anotherPmGets403AndTheProjectIsUnchanged() {
		LoggedIn owner = login(PM);
		LoggedIn other = newPm();
		String name = "Owned-" + UUID.randomUUID();
		int id = createProject(owner.token(), name);

		given().auth().oauth2(other.token()).contentType(ContentType.JSON)
			.body(body("Hijacked", "Acme", "2026-11-01", "2027-03-31"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_PROJECT_OWNER"));

		given().auth().oauth2(owner.token())
			.when().get("/api/projects/" + id)
			.then()
			.statusCode(200)
			.body("name", equalTo(name));
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void otherRolesGet403OnEdit(String email) {
		int id = createProject(login(PM).token(), "Owned-" + UUID.randomUUID());

		given().auth().oauth2(login(email).token()).contentType(ContentType.JSON)
			.body(body("Hijacked", "Acme", "2026-11-01", "2027-03-31"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(403);
	}

	@Test
	void editingAnUnknownProjectIs404() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("Project", "Acme", "2026-11-01", "2027-03-31"))
			.when().put("/api/projects/999999")
			.then()
			.statusCode(404);
	}

	@Test
	void startAfterEndIs400OnEdit() {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Dates-" + UUID.randomUUID());

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(body("Dates", "Acme", "2027-03-31", "2026-11-01"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void requiredFieldsAreValidatedOnEdit() {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Valid-" + UUID.randomUUID());

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("name", "Valid"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "COMPLETED", "CANCELLED" })
	void aClosedProjectCannotBeEdited(String status) {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Closed-" + UUID.randomUUID());
		setStatus(id, ProjectStatus.valueOf(status));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(body("Reopened", "Acme", "2026-11-01", "2027-03-31"))
			.when().put("/api/projects/" + id)
			.then()
			.statusCode(409)
			.body("code", equalTo("PROJECT_CLOSED"));
	}

	private static Map<String, Object> body(String name, String client, String start, String end) {
		Map<String, Object> body = new HashMap<>();
		body.put("name", name);
		body.put("client", client);
		body.put("description", "Customer portal");
		body.put("startDate", start);
		body.put("endDate", end);
		return body;
	}

	private int createProject(String token, String name) {
		ValidatableResponse response = given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(body(name, "Acme", "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then().statusCode(201);
		return response.extract().path("id");
	}

	/** There is no status endpoint yet (US-24), so tests set it directly. */
	private void setStatus(int id, ProjectStatus status) {
		Project project = projectRepository.findById((long) id).orElseThrow();
		project.setStatus(status);
		projectRepository.save(project);
	}

	/** A second PM, because the dev seed has only one. */
	private LoggedIn newPm() {
		String email = "pm-" + UUID.randomUUID() + "@staffsync.local";
		userRepository.save(new User(email, passwordEncoder.encode(PASSWORD), "Other", "Manager", Role.PM));
		return login(email);
	}

	private LoggedIn login(String email) {
		JsonPath response = given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200).extract().jsonPath();
		return new LoggedIn(response.getString("token"), response.getInt("user.id"));
	}

	private record LoggedIn(String token, int id) {

	}

}
