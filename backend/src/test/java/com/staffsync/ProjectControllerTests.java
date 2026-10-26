package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.project.ProjectStatus;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
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

	@Autowired
	StaffingRequestRepository requestRepository;

	@Autowired
	AllocationRepository allocationRepository;

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
			.body("details.field", containsInAnyOrder("name", "client", "description",
					"startDate", "endDate"));
	}

	@Test
	void nameAndClientHaveALengthLimit() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON)
			.body(body("n".repeat(201), "c".repeat(201), "2026-11-01", "2027-03-31"))
			.when().post("/api/projects")
			.then()
			.statusCode(400)
			.body("details.field", containsInAnyOrder("name", "client"));
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
			.body("content.id", not(hasItem(theirs)));
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

	// ---- status (US-24, §9, BR-11)

	@Test
	void theOwnerMovesAProjectFromPlannedToActiveToCompleted() {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Lifecycle-" + UUID.randomUUID());

		changeStatus(pm.token(), id, "ACTIVE").statusCode(200).body("id", equalTo(id)).body("status", equalTo("ACTIVE"));
		changeStatus(pm.token(), id, "COMPLETED").statusCode(200).body("status", equalTo("COMPLETED"));

		given().auth().oauth2(pm.token())
			.when().get("/api/projects/" + id)
			.then()
			.statusCode(200)
			.body("status", equalTo("COMPLETED"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "PLANNED", "ACTIVE" })
	void aPlannedOrActiveProjectCanBeCancelled(String from) {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Cancel-" + UUID.randomUUID());
		setStatus(id, ProjectStatus.valueOf(from));

		changeStatus(pm.token(), id, "CANCELLED").statusCode(200).body("status", equalTo("CANCELLED"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "PLANNED>PLANNED", "PLANNED>COMPLETED", "ACTIVE>PLANNED", "COMPLETED>ACTIVE",
			"COMPLETED>CANCELLED", "CANCELLED>PLANNED", "CANCELLED>ACTIVE" })
	void anyOtherMoveIs409AndTheStatusStays(String move) {
		String[] statuses = move.split(">");
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Move-" + UUID.randomUUID());
		setStatus(id, ProjectStatus.valueOf(statuses[0]));

		changeStatus(pm.token(), id, statuses[1]).statusCode(409).body("code", equalTo("INVALID_STATUS_TRANSITION"));

		assertThat(projectRepository.findById((long) id).orElseThrow().getStatus())
			.isEqualTo(ProjectStatus.valueOf(statuses[0]));
	}

	@Test
	void anotherPmCannotChangeTheStatus() {
		int id = createProject(login(PM).token(), "Owned-" + UUID.randomUUID());

		changeStatus(newPm().token(), id, "ACTIVE").statusCode(403).body("code", equalTo("NOT_PROJECT_OWNER"));

		assertThat(projectRepository.findById((long) id).orElseThrow().getStatus()).isEqualTo(ProjectStatus.PLANNED);
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void otherRolesGet403OnStatus(String email) {
		int id = createProject(login(PM).token(), "Owned-" + UUID.randomUUID());

		changeStatus(login(email).token(), id, "ACTIVE").statusCode(403);
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void aNonPmGets403OnStatusEvenWithAnInvalidBody(String email) {
		int id = createProject(login(PM).token(), "Owned-" + UUID.randomUUID());

		given().auth().oauth2(login(email).token()).contentType(ContentType.JSON).body(Map.of())
			.when().patch("/api/projects/" + id + "/status")
			.then()
			.statusCode(403);
		changeStatus(login(email).token(), id, "ARCHIVED").statusCode(403);
	}

	@Test
	void aMissingOrUnknownStatusIs400() {
		LoggedIn pm = login(PM);
		int id = createProject(pm.token(), "Invalid-" + UUID.randomUUID());

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON).body(Map.of())
			.when().patch("/api/projects/" + id + "/status")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"));
		changeStatus(pm.token(), id, "ARCHIVED").statusCode(400);
	}

	@Test
	void theStatusOfAnUnknownProjectIs404AndWithoutATokenIs401() {
		changeStatus(login(PM).token(), 999999, "ACTIVE").statusCode(404);
		given().contentType(ContentType.JSON).body(Map.of("status", "ACTIVE"))
			.when().patch("/api/projects/1/status")
			.then()
			.statusCode(401);
	}

	// T-21
	@Test
	void cancellingAProjectCleansUpItsRequestsAndAllocations() {
		LoggedIn pm = login(PM);
		User owner = userRepository.findById((long) pm.id()).orElseThrow();
		LocalDate today = LocalDate.now();
		Project project = new Project("T-21-" + UUID.randomUUID(), "Acme", null, today.minusYears(1),
				today.plusYears(1), owner);
		project.setStatus(ProjectStatus.ACTIVE);
		project = projectRepository.save(project);
		// Three of its allocations stay approved, so a headcount of 5 keeps it partially filled
		StaffingRequest open = newRequest(project, 5);
		StaffingRequest filled = newRequest(project, 1);
		filled.setStatus(RequestStatus.FILLED);
		requestRepository.save(filled);

		Allocation proposed = newAllocation(open, AllocationStatus.PROPOSED, today.minusDays(5), today.plusDays(20));
		Allocation running = newAllocation(open, AllocationStatus.APPROVED, today.minusDays(5), today.plusDays(20));
		Allocation changed = new Allocation(open, newEmployee(), 60, today.minusDays(5), today.plusDays(20), owner);
		changed.setStatus(AllocationStatus.APPROVED);
		changed.requestChange(80, today.minusDays(5), today.plusDays(40), "The client asked for more reporting work");
		changed = allocationRepository.save(changed);
		Allocation future = newAllocation(open, AllocationStatus.APPROVED, today.plusDays(1), today.plusDays(20));
		Allocation ended = newAllocation(open, AllocationStatus.APPROVED, today.minusDays(20), today.minusDays(1));
		Allocation futureOnFilled = newAllocation(filled, AllocationStatus.APPROVED, today.plusDays(1),
				today.plusDays(20));

		changeStatus(pm.token(), project.getId().intValue(), "CANCELLED").statusCode(200)
			.body("status", equalTo("CANCELLED"));

		assertThat(reload(proposed).getStatus()).isEqualTo(AllocationStatus.CANCELLED);
		assertThat(reload(running).getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(reload(running).getEndDate()).isEqualTo(today);
		Allocation voided = reload(changed);
		assertThat(voided.getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(voided.getPercent()).isEqualTo(60);
		assertThat(voided.getEndDate()).isEqualTo(today);
		assertThat(voided.getPendingPercent()).isNull();
		assertThat(voided.getPendingEndDate()).isNull();
		assertThat(voided.getChangeReason()).isNull();
		assertThat(reload(future).getStatus()).isEqualTo(AllocationStatus.CANCELLED);
		assertThat(reload(ended).getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(reload(ended).getEndDate()).isEqualTo(today.minusDays(1));
		assertThat(reload(futureOnFilled).getStatus()).isEqualTo(AllocationStatus.CANCELLED);
		// Both requests end up cancelled: the filled one lost its only allocation, so it was no longer filled
		assertThat(requestRepository.findById(open.getId()).orElseThrow().getStatus())
			.isEqualTo(RequestStatus.CANCELLED);
		assertThat(requestRepository.findById(filled.getId()).orElseThrow().getStatus())
			.isEqualTo(RequestStatus.CANCELLED);
	}

	@Test
	void completingAProjectKeepsARequestThatIsStillFilled() {
		LoggedIn pm = login(PM);
		User owner = userRepository.findById((long) pm.id()).orElseThrow();
		LocalDate today = LocalDate.now();
		Project project = new Project("Filled-" + UUID.randomUUID(), "Acme", null, today.minusYears(1),
				today.plusYears(1), owner);
		project.setStatus(ProjectStatus.ACTIVE);
		project = projectRepository.save(project);
		StaffingRequest filled = newRequest(project, 1);
		filled.setStatus(RequestStatus.FILLED);
		requestRepository.save(filled);
		Allocation running = newAllocation(filled, AllocationStatus.APPROVED, today.minusDays(5), today.plusDays(20));

		changeStatus(pm.token(), project.getId().intValue(), "COMPLETED").statusCode(200);

		assertThat(reload(running).getEndDate()).isEqualTo(today);
		assertThat(requestRepository.findById(filled.getId()).orElseThrow().getStatus())
			.isEqualTo(RequestStatus.FILLED);
	}

	private ValidatableResponse changeStatus(String token, int id, String status) {
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("status", status))
			.when().patch("/api/projects/" + id + "/status")
			.then();
	}

	/** A request over the whole project, for the T-21 scenarios. */
	private StaffingRequest newRequest(Project project, int headcount) {
		return requestRepository.save(new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60,
				project.getStartDate(), project.getEndDate(), headcount));
	}

	/** A 60% allocation of a new employee, already in this status. */
	private Allocation newAllocation(StaffingRequest request, AllocationStatus status, LocalDate start,
			LocalDate end) {
		Allocation allocation = new Allocation(request, newEmployee(), 60, start, end, request.getProject().getPm());
		allocation.setStatus(status);
		return allocationRepository.save(allocation);
	}

	private User newEmployee() {
		return userRepository.save(new User("employee-" + UUID.randomUUID() + "@staffsync.local",
				passwordEncoder.encode(PASSWORD), "Test", "Employee", Role.EMPLOYEE));
	}

	private Allocation reload(Allocation allocation) {
		return allocationRepository.findById(allocation.getId()).orElseThrow();
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

	/** Sets the status directly, so a test can start from any status without going through §9. */
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
