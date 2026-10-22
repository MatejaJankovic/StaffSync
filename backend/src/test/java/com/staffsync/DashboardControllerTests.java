package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import java.time.LocalDate;
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
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code GET /api/dashboard} (US-20, T-40). The database is shared with the other tests, so each test makes
 * its own PM, RM and employees and checks exact numbers only for them; the Admin's global counts are checked
 * as deltas. Allocations run from a month before to two months after today, so they cover this week.
 */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DashboardControllerTests {

	private static final String PASSWORD = "Password123!";

	@LocalServerPort
	int port;

	@Autowired
	UserRepository userRepository;

	@Autowired
	ProjectRepository projectRepository;

	@Autowired
	StaffingRequestRepository requestRepository;

	@Autowired
	AllocationRepository allocationRepository;

	@Autowired
	SkillRepository skillRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	/** Loads are per working day, so on a weekend the service looks at the next Monday. */
	private final LocalDate day = workingDayFrom(LocalDate.now());

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	// ---- T-40: each role gets only its own cards

	@ParameterizedTest
	@CsvSource({ "bogdan_employee@staffsync.local, currentLoad, activeProjects, nextAllocation",
			"mateja_pm@staffsync.local, activeProjects, openRequests, awaitingRm",
			"lazar_rm@staffsync.local, pendingDecisions, benchThisWeek, averageLoad",
			"vukasin_admin@staffsync.local, activeUsers, activeProjects, skills" })
	void eachRoleGetsOnlyItsOwnCards(String email, String first, String second, String third) {
		given().auth().oauth2(login(email))
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("key", contains(first, second, third));
	}

	@Test
	void withoutATokenItIs401() {
		given().when().get("/api/dashboard").then().statusCode(401);
	}

	// ---- EMPLOYEE

	@Test
	void anEmployeeSeesTodaysLoadTheirActiveProjectsAndTheNextAllocation() {
		User pm = newUser("Pm", Role.PM);
		User employee = newUser("Ena", Role.EMPLOYEE);
		Project alpha = newProject(pm, ProjectStatus.ACTIVE);
		Project beta = newProject(pm, ProjectStatus.ACTIVE);
		Project gamma = newProject(pm, ProjectStatus.PLANNED);
		allocate(employee, alpha, 60, day.minusDays(30), day.plusDays(60), AllocationStatus.APPROVED);
		// A pending change still counts with its current values (BR-16)
		allocate(employee, beta, 30, day.minusDays(30), day.plusDays(60), AllocationStatus.CHANGE_PENDING);
		// Neither a proposal nor a rejected allocation is active
		allocate(employee, alpha, 10, day.minusDays(30), day.plusDays(60), AllocationStatus.PROPOSED);
		allocate(employee, beta, 10, day.minusDays(30), day.plusDays(60), AllocationStatus.REJECTED);
		allocate(employee, gamma, 10, day.plusDays(14), day.plusDays(60), AllocationStatus.APPROVED);
		allocate(employee, alpha, 10, day.plusDays(30), day.plusDays(60), AllocationStatus.APPROVED);
		allocate(employee, beta, 10, day.plusDays(7), day.plusDays(60), AllocationStatus.PROPOSED);

		given().auth().oauth2(login(employee.getEmail()))
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("value", contains("90%", "2", gamma.getName()))
			.body("[2].date", equalTo(day.plusDays(14).toString()))
			.body("link", contains("/my-allocations", "/my-allocations", "/my-allocations"));
	}

	@Test
	void anEmployeeWithoutAllocationsSeesZerosAndNone() {
		User employee = newUser("New", Role.EMPLOYEE);

		given().auth().oauth2(login(employee.getEmail()))
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("value", contains("0%", "0", "None"))
			.body("[2].date", nullValue());
	}

	// ---- PM

	@Test
	void aPmSeesActiveProjectsOpenRequestsAndWhatWaitsForAnRmAndTheCountDropsAfterAnApproval() {
		User pm = newUser("Ana", Role.PM);
		User employee = newUser("Marko", Role.EMPLOYEE);
		Project active = newProject(pm, ProjectStatus.ACTIVE);
		Project planned = newProject(pm, ProjectStatus.PLANNED);
		newProject(pm, ProjectStatus.COMPLETED);
		Project someoneElses = newProject(newUser("Other", Role.PM), ProjectStatus.ACTIVE);
		newRequest(active, RequestStatus.OPEN);
		newRequest(planned, RequestStatus.PARTIALLY_FILLED);
		newRequest(active, RequestStatus.FILLED);
		newRequest(active, RequestStatus.CANCELLED);
		newRequest(someoneElses, RequestStatus.OPEN);
		Allocation proposed = allocate(employee, planned, 20, day, day.plusDays(30), AllocationStatus.PROPOSED);
		allocate(employee, active, 20, day, day.plusDays(30), AllocationStatus.CHANGE_PENDING);
		allocate(employee, active, 20, day, day.plusDays(30), AllocationStatus.APPROVED);
		allocate(employee, someoneElses, 20, day, day.plusDays(30), AllocationStatus.PROPOSED);
		String token = login(pm.getEmail());

		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("value", contains("1", "2", "2"))
			.body("link", contains("/projects", "/projects", "/projects"));

		setStatus(proposed, AllocationStatus.APPROVED);

		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then().statusCode(200).body("value", contains("1", "2", "1"));
	}

	// ---- RM

	@Test
	void anRmSeesPendingDecisionsTheBenchAndTheAverageLoadAndTheyChangeAfterAnApproval() {
		User rm = newUser("Igor", Role.RM);
		User pm = newUser("Ana", Role.PM);
		Project project = newProject(pm, ProjectStatus.ACTIVE);
		newEmployee("Free", rm);
		User busy = newEmployee("Busy", rm);
		User proposedOnly = newEmployee("Proposed", rm);
		User former = newEmployee("Former", rm);
		former.setActive(false);
		userRepository.save(former);
		User otherTeam = newEmployee("Other", newUser("Other", Role.RM));
		allocate(busy, project, 80, day.minusDays(30), day.plusDays(60), AllocationStatus.APPROVED);
		allocate(busy, project, 20, day.minusDays(30), day.plusDays(60), AllocationStatus.CHANGE_PENDING);
		Allocation proposal = allocate(proposedOnly, project, 50, day.minusDays(30), day.plusDays(60),
				AllocationStatus.PROPOSED);
		allocate(otherTeam, project, 50, day.minusDays(30), day.plusDays(60), AllocationStatus.PROPOSED);
		String token = login(rm.getEmail());

		// Free and Proposed are at 0% (a proposal isn't active); the inactive member doesn't count: 100 / 3 = 33%
		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("value", contains("2", "2", "33%"))
			.body("link", contains("/approvals", "/team", "/team"));

		setStatus(proposal, AllocationStatus.APPROVED);

		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then().statusCode(200).body("value", contains("1", "1", "50%"));
	}

	@Test
	void anRmWithoutATeamSeesZeros() {
		User rm = newUser("Lonely", Role.RM);

		given().auth().oauth2(login(rm.getEmail()))
			.when().get("/api/dashboard")
			.then().statusCode(200).body("value", contains("0", "0", "0%"));
	}

	// ---- ADMIN

	@Test
	void anAdminSeesActiveUsersActiveProjectsAndSkillsAndTheProjectsCardHasNoLink() {
		String token = login("vukasin_admin@staffsync.local");
		List<Integer> before = numbers(token);

		newUser("Active", Role.EMPLOYEE);
		User inactive = newUser("Inactive", Role.EMPLOYEE);
		inactive.setActive(false);
		userRepository.save(inactive);
		User pm = newUser("Pm", Role.PM);
		newProject(pm, ProjectStatus.ACTIVE);
		newProject(pm, ProjectStatus.PLANNED);

		// Two active users (the employee and the PM), one ACTIVE project, the same catalog
		assertThat(numbers(token)).containsExactly(before.get(0) + 2, before.get(1) + 1,
				(int) skillRepository.count());
		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then()
			.statusCode(200)
			.body("link", contains("/admin/users", null, "/admin/skills"));
	}

	// ---- helpers

	private List<Integer> numbers(String token) {
		List<String> values = given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then().statusCode(200).extract().jsonPath().getList("value", String.class);
		return values.stream().map(Integer::valueOf).toList();
	}

	/** Approvals come with US-10, so tests set the status directly. */
	private void setStatus(Allocation allocation, AllocationStatus status) {
		allocation.setStatus(status);
		allocationRepository.save(allocation);
	}

	private Allocation allocate(User employee, Project project, int percent, LocalDate start, LocalDate end,
			AllocationStatus status) {
		// FILLED, so the allocations' own requests don't add to the PM's open requests
		StaffingRequest request = newRequest(project, RequestStatus.FILLED);
		Allocation allocation = new Allocation(request, employee, percent, start, end, project.getPm());
		allocation.setStatus(status);
		return allocationRepository.save(allocation);
	}

	private StaffingRequest newRequest(Project project, RequestStatus status) {
		StaffingRequest request = new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60,
				day.minusDays(60), day.plusDays(90), 2);
		request.setStatus(status);
		return requestRepository.save(request);
	}

	private Project newProject(User pm, ProjectStatus status) {
		Project project = new Project("Project-" + UUID.randomUUID(), "Acme", null, day.minusDays(60),
				day.plusDays(120), pm);
		project.setStatus(status);
		return projectRepository.save(project);
	}

	private User newEmployee(String firstName, User manager) {
		User employee = newUser(firstName, Role.EMPLOYEE);
		employee.setManager(manager);
		return userRepository.save(employee);
	}

	private User newUser(String firstName, Role role) {
		String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@staffsync.local";
		return userRepository.save(new User(email, passwordEncoder.encode(PASSWORD), firstName, "Test", role));
	}

	private String login(String email) {
		JsonPath response = given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200).extract().jsonPath();
		return response.getString("token");
	}

	private static LocalDate workingDayFrom(LocalDate day) {
		return switch (day.getDayOfWeek()) {
			case SATURDAY -> day.plusDays(2);
			case SUNDAY -> day.plusDays(1);
			default -> day;
		};
	}

}
