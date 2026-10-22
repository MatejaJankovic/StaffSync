package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.project.ProjectStatus;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
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
class StaffingRequestControllerTests {

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
	StaffingRequestRepository requestRepository;

	@Autowired
	SkillRepository skillRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	@Test
	void pmCreatesTheDemoRequestFromTheSpec() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token()); // 2026-11-01 – 2027-03-31

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(201)
			.body("id", notNullValue())
			.body("projectId", equalTo(project))
			.body("title", equalTo("Java Developer"))
			.body("seniority", equalTo("MEDIOR"))
			.body("allocationPercent", equalTo(60))
			.body("startDate", equalTo("2026-11-01"))
			.body("endDate", equalTo("2027-01-31"))
			.body("headcount", equalTo(2))
			.body("status", equalTo("OPEN"))
			.body("createdAt", notNullValue())
			.body("skills", hasSize(3))
			.body("skills.skillName", contains("Java", "Spring", "PostgreSQL"))
			.body("skills.minLevel", contains(4, 3, 2))
			.body("skills.mandatory", contains(true, true, false));
	}

	@Test
	void theClientCannotChooseTheStatusOrTheProject() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int other = createProject(pm.token());
		Map<String, Object> body = demoRequest();
		body.put("status", "FILLED");
		body.put("projectId", other);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(201)
			.body("status", equalTo("OPEN"))
			.body("projectId", equalTo(project));
	}

	@Test
	void aRequestMayHaveNoSkills() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of());

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(201)
			.body("skills", hasSize(0));
	}

	@Test
	void theTitleIsTrimmed() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("title", "  Java Developer  ");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(201)
			.body("title", equalTo("Java Developer"));
	}

	// ---- BR-4 / T-11

	@Test
	void anotherPmCannotCreateARequestOnSomeoneElsesProject() {
		int project = createProject(login(PM).token());

		given().auth().oauth2(newPm().token()).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_PROJECT_OWNER"));
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void onlyAPmCanCreateARequest(String email) {
		int project = createProject(login(PM).token());

		given().auth().oauth2(login(email).token()).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(403)
			.body("code", equalTo("FORBIDDEN"));
	}

	@Test
	void aNonPmGets403EvenWithAnInvalidBody() {
		int project = createProject(login(PM).token());

		given().auth().oauth2(login(RM).token()).contentType(ContentType.JSON).body(Map.of("title", ""))
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(403);
	}

	@Test
	void anotherPmCannotReadEditOrCancelARequest() {
		LoggedIn owner = login(PM);
		int request = createRequest(owner.token(), createProject(owner.token()));
		String other = newPm().token();

		given().auth().oauth2(other).when().get("/api/requests/" + request).then().statusCode(403);
		given().auth().oauth2(other).contentType(ContentType.JSON).body(demoRequest())
			.when().put("/api/requests/" + request).then().statusCode(403);
		given().auth().oauth2(other).when().delete("/api/requests/" + request).then().statusCode(403);

		given().auth().oauth2(owner.token()).when().get("/api/requests/" + request)
			.then().statusCode(200).body("status", equalTo("OPEN")).body("title", equalTo("Java Developer"));
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void otherRolesCannotReadEditOrCancelARequest(String email) {
		LoggedIn owner = login(PM);
		int request = createRequest(owner.token(), createProject(owner.token()));
		String token = login(email).token();

		given().auth().oauth2(token).when().get("/api/requests/" + request).then().statusCode(403);
		given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("title", ""))
			.when().put("/api/requests/" + request).then().statusCode(403);
		given().auth().oauth2(token).when().delete("/api/requests/" + request).then().statusCode(403);
	}

	@Test
	void withoutATokenEverythingIs401() {
		given().when().get("/api/projects/1/requests").then().statusCode(401);
		given().contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/1/requests").then().statusCode(401);
		given().when().get("/api/requests/1").then().statusCode(401);
		given().contentType(ContentType.JSON).body(demoRequest()).when().put("/api/requests/1").then().statusCode(401);
		given().when().delete("/api/requests/1").then().statusCode(401);
	}

	// ---- BR-3 / T-09, T-10

	@Test
	void aRequestStartingBeforeTheProjectIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("startDate", "2026-10-31");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("REQUEST_OUTSIDE_PROJECT"));
	}

	@Test
	void aRequestEndingAfterTheProjectIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("endDate", "2027-04-01");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("REQUEST_OUTSIDE_PROJECT"));
	}

	@Test
	void aRequestCoveringTheWholeProjectIsAllowed() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("startDate", "2026-11-01");
		body.put("endDate", "2027-03-31");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(201);
	}

	@Test
	void endBeforeStartIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("startDate", "2026-12-10");
		body.put("endDate", "2026-12-09");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void aOneDayRequestIsAllowed() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("startDate", "2026-12-10");
		body.put("endDate", "2026-12-10");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(201);
	}

	@Test
	void theOwnerCannotMoveARequestOutsideTheProjectOnEdit() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		Map<String, Object> body = demoRequest();
		body.put("endDate", "2027-04-01");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(400)
			.body("code", equalTo("REQUEST_OUTSIDE_PROJECT"));
		given().auth().oauth2(pm.token()).when().get("/api/requests/" + request)
			.then().body("endDate", equalTo("2027-01-31"));
	}

	// ---- field rules

	@Test
	void requiredFieldsAreValidated() {
		LoggedIn pm = login(PM);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(Map.of())
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("title"))
			.body("details.field", hasItem("seniority"))
			.body("details.field", hasItem("allocationPercent"))
			.body("details.field", hasItem("startDate"))
			.body("details.field", hasItem("endDate"))
			.body("details.field", hasItem("headcount"))
			.body("details.field", hasItem("skills"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, 5, 9, 15, 65, 110, 200, -10 })
	void allocationMustBeBetween10And100InStepsOf10(int percent) {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("allocationPercent", percent);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("allocationPercent"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 10, 20, 50, 60, 100 })
	void everyStepOfTenIsAllowed(int percent) {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("allocationPercent", percent);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(201)
			.body("allocationPercent", equalTo(percent));
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, -1 })
	void headcountMustBeAtLeastOne(int headcount) {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("headcount", headcount);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("details.field", hasItem("headcount"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, 6, -1 })
	void aSkillLevelMustBeBetween1And5(int level) {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of(skill("Java", level, true)));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("details.field", hasItem("skills[0].minLevel"));
	}

	@Test
	void aSkillNeedsAnIdALevelAndAMandatoryFlag() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of(Map.of()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("details.field", hasItem("skills[0].skillId"))
			.body("details.field", hasItem("skills[0].minLevel"))
			.body("details.field", hasItem("skills[0].mandatory"));
	}

	@Test
	void anUnknownSkillIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of(skill("Java", 4, true), Map.of("skillId", 999999, "minLevel", 3, "mandatory", true)));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details[0].field", equalTo("skills[1].skillId"));
	}

	@Test
	void aSkillListedTwiceIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of(skill("Java", 4, true), skill("Java", 2, false)));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400)
			.body("details[0].field", equalTo("skills[1].skillId"));
	}

	@Test
	void titleIsRequiredAndLimited() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		Map<String, Object> blank = demoRequest();
		blank.put("title", "   ");
		Map<String, Object> tooLong = demoRequest();
		tooLong.put("title", "x".repeat(201));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(blank)
			.when().post("/api/projects/" + project + "/requests")
			.then().statusCode(400).body("details.field", hasItem("title"));
		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(tooLong)
			.when().post("/api/projects/" + project + "/requests")
			.then().statusCode(400).body("details.field", hasItem("title"));
	}

	@Test
	void anUnknownSeniorityIs400() {
		LoggedIn pm = login(PM);
		Map<String, Object> body = demoRequest();
		body.put("seniority", "GURU");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + createProject(pm.token()) + "/requests")
			.then()
			.statusCode(400);
	}

	@Test
	void creatingOnAnUnknownProjectIs404() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/999999/requests")
			.then()
			.statusCode(404)
			.body("code", equalTo("NOT_FOUND"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "COMPLETED", "CANCELLED" })
	void aClosedProjectTakesNoNewRequests(String status) {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		setProjectStatus(project, ProjectStatus.valueOf(status));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/" + project + "/requests")
			.then()
			.statusCode(409)
			.body("code", equalTo("PROJECT_CLOSED"));
	}

	// ---- listing

	@ParameterizedTest
	@ValueSource(strings = { PM, RM, EMPLOYEE, ADMIN })
	void everyRoleCanListTheRequestsOfAProject(String email) {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		createRequest(pm.token(), project);

		given().auth().oauth2(login(email).token())
			.when().get("/api/projects/" + project + "/requests")
			.then()
			.statusCode(200)
			.body("content", hasSize(1))
			.body("content[0].title", equalTo("Java Developer"))
			.body("content[0].skills", hasSize(3));
	}

	@Test
	void listIsPagedWithTheStandardShapeAndOnlyHasThisProjectsRequests() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int otherProject = createProject(pm.token());
		for (int i = 0; i < 3; i++) {
			createRequest(pm.token(), project);
		}
		createRequest(pm.token(), otherProject);

		given().auth().oauth2(pm.token()).queryParam("size", 2)
			.when().get("/api/projects/" + project + "/requests")
			.then()
			.statusCode(200)
			.body("content", hasSize(2))
			.body("page.size", equalTo(2))
			.body("page.number", equalTo(0))
			.body("page.totalElements", equalTo(3))
			.body("page.totalPages", equalTo(2));
	}

	@Test
	void listCanBeSortedByAPropertyAndAnUnknownOneIs400() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		createRequest(pm.token(), project, "B request");
		createRequest(pm.token(), project, "A request");

		given().auth().oauth2(pm.token()).queryParam("sort", "title,asc")
			.when().get("/api/projects/" + project + "/requests")
			.then()
			.statusCode(200)
			.body("content.title", contains("A request", "B request"));
		given().auth().oauth2(pm.token()).queryParam("sort", "project")
			.when().get("/api/projects/" + project + "/requests")
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_SORT"));
	}

	@Test
	void listingAnUnknownProjectIs404() {
		given().auth().oauth2(login(PM).token())
			.when().get("/api/projects/999999/requests")
			.then()
			.statusCode(404);
	}

	@Test
	void anUnknownRequestIs404() {
		String token = login(PM).token();

		given().auth().oauth2(token).when().get("/api/requests/999999").then().statusCode(404);
		given().auth().oauth2(token).contentType(ContentType.JSON).body(demoRequest())
			.when().put("/api/requests/999999").then().statusCode(404);
		given().auth().oauth2(token).when().delete("/api/requests/999999").then().statusCode(404);
	}

	// ---- edit

	@Test
	void theOwnerEditsARequestAndTheSkillsAreReplaced() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		Map<String, Object> body = new HashMap<>();
		body.put("title", "Senior Java Developer");
		body.put("seniority", "SENIOR");
		body.put("allocationPercent", 80);
		body.put("startDate", "2026-12-01");
		body.put("endDate", "2027-02-28");
		body.put("headcount", 3);
		// Java stays with a higher level, Spring is dropped, PostgreSQL becomes required, Docker is new
		body.put("skills", List.of(skill("Java", 5, true), skill("PostgreSQL", 3, true), skill("Docker", 1, false)));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("id", equalTo(request))
			.body("title", equalTo("Senior Java Developer"))
			.body("seniority", equalTo("SENIOR"))
			.body("allocationPercent", equalTo(80))
			.body("startDate", equalTo("2026-12-01"))
			.body("endDate", equalTo("2027-02-28"))
			.body("headcount", equalTo(3))
			.body("status", equalTo("OPEN"))
			.body("skills.skillName", contains("Java", "PostgreSQL", "Docker"))
			.body("skills.minLevel", contains(5, 3, 1))
			.body("skills.mandatory", contains(true, true, false));

		// and it was saved, not just returned
		given().auth().oauth2(pm.token()).when().get("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("title", equalTo("Senior Java Developer"))
			.body("skills.skillName", contains("Java", "PostgreSQL", "Docker"));
	}

	@Test
	void editingCanClearTheSkills() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		Map<String, Object> body = demoRequest();
		body.put("skills", List.of());

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("skills", hasSize(0));
	}

	@Test
	void editingCannotChangeTheStatus() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		Map<String, Object> body = demoRequest();
		body.put("status", "FILLED");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("status", equalTo("OPEN"));
	}

	@Test
	void editIsValidatedLikeCreate() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		Map<String, Object> body = demoRequest();
		body.put("allocationPercent", 65);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(body)
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(400)
			.body("details.field", hasItem("allocationPercent"));
	}

	@Test
	void aCancelledRequestCannotBeEdited() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request).then().statusCode(200);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(demoRequest())
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(409)
			.body("code", equalTo("REQUEST_CANCELLED"));
	}

	@Test
	void aRequestOfAClosedProjectCannotBeEdited() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project);
		setProjectStatus(project, ProjectStatus.COMPLETED);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(demoRequest())
			.when().put("/api/requests/" + request)
			.then()
			.statusCode(409)
			.body("code", equalTo("PROJECT_CLOSED"));
	}

	// ---- cancel

	@Test
	void deleteCancelsTheRequestWithoutRemovingIt() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project);

		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("id", equalTo(request))
			.body("status", equalTo("CANCELLED"));

		given().auth().oauth2(pm.token()).when().get("/api/requests/" + request)
			.then().statusCode(200).body("status", equalTo("CANCELLED"));
		given().auth().oauth2(pm.token()).when().get("/api/projects/" + project + "/requests")
			.then().body("content", hasSize(1)).body("content[0].status", equalTo("CANCELLED"));
	}

	@Test
	void cancellingTwiceIs409() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request).then().statusCode(200);

		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request)
			.then()
			.statusCode(409)
			.body("code", equalTo("REQUEST_CANCELLED"));
	}

	@Test
	void aPartiallyFilledRequestCanBeCancelled() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		setRequestStatus(request, RequestStatus.PARTIALLY_FILLED); // BR-10 does this once allocations exist (US-10)

		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request)
			.then()
			.statusCode(200)
			.body("status", equalTo("CANCELLED"));
	}

	@Test
	void aFilledRequestCannotBeCancelled() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		setRequestStatus(request, RequestStatus.FILLED); // BR-10 does this once allocations exist (US-10)

		given().auth().oauth2(pm.token()).when().delete("/api/requests/" + request)
			.then()
			.statusCode(409)
			.body("code", equalTo("REQUEST_HAS_ACTIVE_ALLOCATIONS"));
		given().auth().oauth2(pm.token()).when().get("/api/requests/" + request)
			.then().body("status", equalTo("FILLED"));
	}

	@Test
	void aSkillThatARequestUsesCannotBeDeleted() {
		LoggedIn pm = login(PM);
		createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(login(ADMIN).token())
			.when().delete("/api/skills/" + skillId("Java"))
			.then()
			.statusCode(409);
	}

	// ---- helpers

	private Map<String, Object> demoRequest() {
		Map<String, Object> body = new HashMap<>();
		body.put("title", "Java Developer");
		body.put("seniority", "MEDIOR");
		body.put("allocationPercent", 60);
		body.put("startDate", "2026-11-01");
		body.put("endDate", "2027-01-31");
		body.put("headcount", 2);
		body.put("skills", new ArrayList<>(List.of(skill("Java", 4, true), skill("Spring", 3, true),
				skill("PostgreSQL", 2, false))));
		return body;
	}

	private Map<String, Object> skill(String name, int level, boolean mandatory) {
		Map<String, Object> skill = new HashMap<>();
		skill.put("skillId", skillId(name));
		skill.put("minLevel", level);
		skill.put("mandatory", mandatory);
		return skill;
	}

	/** The catalog is seeded by a migration, so "Java", "Spring", "PostgreSQL" and "Docker" are always there. */
	private long skillId(String name) {
		return skillRepository.findAll().stream().filter(skill -> skill.getName().equals(name)).findFirst()
			.map(Skill::getId).orElseThrow();
	}

	private int createProject(String token) {
		return given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "Project-" + UUID.randomUUID(), "client", "Acme", "startDate", "2026-11-01",
					"endDate", "2027-03-31"))
			.when().post("/api/projects")
			.then().statusCode(201).extract().path("id");
	}

	private int createRequest(String token, int project) {
		return createRequest(token, project, "Java Developer");
	}

	private int createRequest(String token, int project, String title) {
		Map<String, Object> body = demoRequest();
		body.put("title", title);
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + project + "/requests")
			.then().statusCode(201).extract().path("id");
	}

	/** There is no status endpoint for projects yet (US-24), so tests set it directly. */
	private void setProjectStatus(int id, ProjectStatus status) {
		Project project = projectRepository.findById((long) id).orElseThrow();
		project.setStatus(status);
		projectRepository.save(project);
	}

	private void setRequestStatus(int id, RequestStatus status) {
		StaffingRequest request = requestRepository.findById((long) id).orElseThrow();
		request.setStatus(status);
		requestRepository.save(request);
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
