package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
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

/**
 * {@code /api/allocations} (US-08). Every test makes its own employees, so allocations from one
 * test never change the capacity seen by another. The request is the §4 demo one: 60%,
 * 2026-11-01 – 2027-01-31, Java ≥ 4 and Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have.
 */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AllocationControllerTests {

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
	EmployeeSkillRepository employeeSkillRepository;

	@Autowired
	AllocationRepository allocationRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	// ---- propose

	@Test
	void pmProposesAnEmployeeAndPercentAndPeriodDefaultToTheRequest() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project);
		User marko = newEmployee("Marko");

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", marko.getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(201)
			.body("allocation.id", notNullValue())
			.body("allocation.status", equalTo("PROPOSED"))
			.body("allocation.employeeId", equalTo(marko.getId().intValue()))
			.body("allocation.employeeName", equalTo("Marko Test"))
			.body("allocation.projectId", equalTo(project))
			.body("allocation.requestId", equalTo(request))
			.body("allocation.requestTitle", equalTo("Java Developer"))
			.body("allocation.percent", equalTo(60))
			.body("allocation.startDate", equalTo("2026-11-01"))
			.body("allocation.endDate", equalTo("2027-01-31"))
			.body("allocation.createdAt", notNullValue())
			.body("allocation.pendingPercent", nullValue())
			.body("warnings", empty());
	}

	@Test
	void theGivenPercentAndPeriodAreUsed() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, newEmployee("Jelena"), 40, "2026-11-15", "2027-01-31"))
			.when().post("/api/allocations")
			.then()
			.statusCode(201)
			.body("allocation.percent", equalTo(40))
			.body("allocation.startDate", equalTo("2026-11-15"))
			.body("allocation.endDate", equalTo("2027-01-31"));
	}

	// ---- BR-4 / T-11

	@Test
	void anotherPmCannotProposeOnSomeoneElsesProject() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(newPm().token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_PROJECT_OWNER"));
	}

	@ParameterizedTest
	@ValueSource(strings = { RM, EMPLOYEE, ADMIN })
	void onlyAPmCanPropose(String email) {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(login(email).token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(403)
			.body("code", equalTo("FORBIDDEN"));
	}

	@Test
	void withoutATokenItIs401() {
		given().contentType(ContentType.JSON).body(Map.of("requestId", 1, "employeeId", 1))
			.when().post("/api/allocations").then().statusCode(401);
	}

	// ---- BR-3 / T-09, T-10

	@Test
	void anAllocationStartingBeforeTheRequestIs400() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, newEmployee("Marko"), null, "2026-10-31", null))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("ALLOCATION_OUTSIDE_REQUEST"));
	}

	@Test
	void anAllocationEndingAfterTheRequestIs400() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, newEmployee("Marko"), null, null, "2027-02-01"))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("ALLOCATION_OUTSIDE_REQUEST"));
	}

	@Test
	void endBeforeStartIs400() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, newEmployee("Marko"), null, "2026-12-10", "2026-12-09"))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_PERIOD"));
	}

	// ---- BR-9 / T-17

	@ParameterizedTest
	@ValueSource(strings = { "FILLED", "CANCELLED" })
	void aFilledOrCancelledRequestTakesNoProposals(String status) {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		setRequestStatus(request, RequestStatus.valueOf(status));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(409)
			.body("code", equalTo("REQUEST_NOT_OPEN"));
	}

	@Test
	void aPartiallyFilledRequestTakesProposals() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		setRequestStatus(request, RequestStatus.PARTIALLY_FILLED);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(201);
	}

	@Test
	void aClosedProjectTakesNoProposals() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project);
		setProjectStatus(project, ProjectStatus.COMPLETED);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(409)
			.body("code", equalTo("PROJECT_CLOSED"));
	}

	// ---- BR-9 / T-18

	@Test
	void anEmployeeWithoutAMandatorySkillIs400WithTheMissingSkills() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		// Java one level too low, no Spring, PostgreSQL is only nice to have
		User junior = newEmployee("Junior", Map.of("Java", 3, "PostgreSQL", 5));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", junior.getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("MISSING_MANDATORY_SKILLS"))
			.body("details.skillName", contains("Java", "Spring"))
			.body("details.minLevel", contains(4, 3))
			.body("details.level", contains(3, null));
	}

	@Test
	void anInactiveEmployeeIs400() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		User former = newEmployee("Former");
		former.setActive(false);
		userRepository.save(former);

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", former.getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("EMPLOYEE_NOT_ELIGIBLE"));
	}

	@Test
	void aUserWhoIsNotAnEmployeeIs400() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", login(RM).id()))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("EMPLOYEE_NOT_ELIGIBLE"));
	}

	// ---- BR-8 / T-16

	@Test
	void theSameEmployeeProposedTwiceOnTheSameRequestIs409() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		User marko = newEmployee("Marko");
		propose(pm.token(), proposal(request, marko, null, null, "2026-11-30"));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, marko, null, "2026-11-30", null))
			.when().post("/api/allocations")
			.then()
			.statusCode(409)
			.body("code", equalTo("ALLOCATION_OVERLAP"));
	}

	@Test
	void theSameEmployeeCanBeProposedAgainForAPeriodThatDoesNotOverlap() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		User marko = newEmployee("Marko");
		propose(pm.token(), proposal(request, marko, null, null, "2026-11-30"));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, marko, null, "2026-12-01", null))
			.when().post("/api/allocations")
			.then()
			.statusCode(201);
	}

	// ---- BR-2 / T-08

	@Test
	void aProposalThatGoesOverCapacityWithProposedOnesIs201WithAWarning() {
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		User marko = newEmployee("Marko");
		propose(pm.token(), Map.of("requestId", createRequest(pm.token(), project), "employeeId", marko.getId()));

		// 60% proposed + 60% new = 120% on every working day: 2 Nov 2026 is a Monday, 29 Jan 2027 a Friday
		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", createRequest(pm.token(), project), "employeeId", marko.getId()))
			.when().post("/api/allocations")
			.then()
			.statusCode(201)
			.body("allocation.status", equalTo("PROPOSED"))
			.body("warnings", contains("Capacity would be exceeded on 2026-11-02 – 2027-01-29 (120%)"));
	}

	// ---- field rules

	@Test
	void requestAndEmployeeAreRequired() {
		given().auth().oauth2(login(PM).token()).contentType(ContentType.JSON).body(Map.of())
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("requestId"))
			.body("details.field", hasItem("employeeId"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, 5, 65, 110, -10 })
	void percentMustBeBetween10And100InStepsOf10(int percent) {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(proposal(request, newEmployee("Marko"), percent, null, null))
			.when().post("/api/allocations")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("percent"));
	}

	@Test
	void anUnknownRequestOrEmployeeIs404() {
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()));

		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", 999999, "employeeId", newEmployee("Marko").getId()))
			.when().post("/api/allocations")
			.then().statusCode(404).body("code", equalTo("NOT_FOUND"));
		given().auth().oauth2(pm.token()).contentType(ContentType.JSON)
			.body(Map.of("requestId", request, "employeeId", 999999))
			.when().post("/api/allocations")
			.then().statusCode(404).body("code", equalTo("NOT_FOUND"));
	}

	// ---- search, filtered by role

	/**
	 * Two projects of two PMs. Ena reports to a new RM, Filip to another one. Ena is on both projects,
	 * Filip only on the first.
	 */
	private Scenario scenario() {
		LoggedIn pmA = login(PM);
		LoggedIn pmB = newPm();
		int projectA = createProject(pmA.token());
		int projectB = createProject(pmB.token());
		User rm = newUser("Team", Role.RM);
		User ena = newEmployee("Ena", rm);
		User filip = newEmployee("Filip", newUser("Other", Role.RM));
		int requestA = createRequest(pmA.token(), projectA);
		int enaOnA = propose(pmA.token(), proposal(requestA, ena, null, null, null));
		int filipOnA = propose(pmA.token(), proposal(requestA, filip, null, "2026-12-01", null));
		int enaOnB = propose(pmB.token(),
				proposal(createRequest(pmB.token(), projectB), ena, 30, "2026-11-15", "2026-11-30"));
		return new Scenario(pmA, pmB, rm, ena, filip, projectA, projectB, enaOnA, filipOnA, enaOnB);
	}

	@Test
	void anEmployeeSeesOnlyTheirOwnAllocations() {
		Scenario s = scenario();

		given().auth().oauth2(login(s.ena().getEmail()).token())
			.when().get("/api/allocations")
			.then()
			.statusCode(200)
			.body("content.id", contains(s.enaOnA(), s.enaOnB()))
			.body("page.totalElements", equalTo(2));
	}

	@Test
	void aPmSeesOnlyTheAllocationsOnTheirProjects() {
		Scenario s = scenario();

		given().auth().oauth2(s.pmB().token())
			.when().get("/api/allocations")
			.then()
			.statusCode(200)
			.body("content.id", contains(s.enaOnB()))
			.body("content[0].projectId", equalTo(s.projectB()));
	}

	@Test
	void anRmSeesOnlyTheAllocationsOfTheirTeam() {
		Scenario s = scenario();

		given().auth().oauth2(login(s.rm().getEmail()).token())
			.when().get("/api/allocations")
			.then()
			.statusCode(200)
			.body("content.id", contains(s.enaOnA(), s.enaOnB()));
	}

	@Test
	void anAdminSeesEveryAllocation() {
		Scenario s = scenario();
		String admin = login(ADMIN).token();

		given().auth().oauth2(admin).queryParam("projectId", s.projectA())
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnA(), s.filipOnA()));
		given().auth().oauth2(admin).queryParam("projectId", s.projectB())
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnB()));
	}

	@Test
	void aFilterOutsideTheCallersScopeGivesAnEmptyPage() {
		Scenario s = scenario();

		given().auth().oauth2(login(s.ena().getEmail()).token()).queryParam("employeeId", s.filip().getId())
			.when().get("/api/allocations")
			.then().statusCode(200).body("content", empty()).body("page.totalElements", equalTo(0));
		given().auth().oauth2(s.pmB().token()).queryParam("projectId", s.projectA())
			.when().get("/api/allocations")
			.then().statusCode(200).body("content", empty());
	}

	@Test
	void theDtoHasEverythingTheTeamPanelShows() {
		Scenario s = scenario();

		given().auth().oauth2(s.pmA().token()).queryParam("projectId", s.projectA())
			.when().get("/api/allocations")
			.then()
			.statusCode(200)
			.body("content[0].employeeId", equalTo(s.ena().getId().intValue()))
			.body("content[0].employeeName", equalTo("Ena Test"))
			.body("content[0].projectName", notNullValue())
			.body("content[0].requestTitle", equalTo("Java Developer"))
			.body("content[0].percent", equalTo(60))
			.body("content[0].startDate", equalTo("2026-11-01"))
			.body("content[0].endDate", equalTo("2027-01-31"))
			.body("content[0].status", equalTo("PROPOSED"))
			.body("content[0].pendingPercent", nullValue())
			.body("content[0].pendingStartDate", nullValue())
			.body("content[0].pendingEndDate", nullValue())
			.body("content[0].changeReason", nullValue());
	}

	@Test
	void filtersByStatusEmployeeAndPeriod() {
		Scenario s = scenario();
		String admin = login(ADMIN).token();
		setAllocationStatus(s.filipOnA(), AllocationStatus.APPROVED);

		given().auth().oauth2(admin).queryParam("projectId", s.projectA()).queryParam("status", "APPROVED")
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.filipOnA()));
		given().auth().oauth2(admin).queryParam("employeeId", s.ena().getId())
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnA(), s.enaOnB()));
		// Ena on B ends on 30 Nov, so a period from 1 Dec only overlaps her allocation on A
		given().auth().oauth2(admin).queryParam("employeeId", s.ena().getId()).queryParam("from", "2026-12-01")
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnA()));
		// Filip on A starts on 1 Dec, which counts as an overlap with a period ending that day
		given().auth().oauth2(admin).queryParam("projectId", s.projectA()).queryParam("to", "2026-12-01")
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnA(), s.filipOnA()));
		given().auth().oauth2(admin).queryParam("projectId", s.projectA()).queryParam("to", "2026-11-30")
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnA()));
	}

	@Test
	void isPagedAndSortedByStartDateByDefault() {
		Scenario s = scenario();

		// Ena on A starts 1 Nov, Ena on B 15 Nov
		given().auth().oauth2(login(s.ena().getEmail()).token()).queryParam("size", 1)
			.when().get("/api/allocations")
			.then()
			.statusCode(200)
			.body("content.id", contains(s.enaOnA()))
			.body("page.size", equalTo(1))
			.body("page.totalElements", equalTo(2))
			.body("page.totalPages", equalTo(2));
		given().auth().oauth2(login(s.ena().getEmail()).token()).queryParam("sort", "percent,asc")
			.when().get("/api/allocations")
			.then().statusCode(200).body("content.id", contains(s.enaOnB(), s.enaOnA()));
	}

	@Test
	void badSearchParametersAre400() {
		String token = login(ADMIN).token();

		given().auth().oauth2(token).queryParam("from", "2026-12-01").queryParam("to", "2026-11-01")
			.when().get("/api/allocations").then().statusCode(400).body("code", equalTo("INVALID_PERIOD"));
		given().auth().oauth2(token).queryParam("sort", "employee")
			.when().get("/api/allocations").then().statusCode(400).body("code", equalTo("INVALID_SORT"));
		given().auth().oauth2(token).queryParam("status", "PENDING")
			.when().get("/api/allocations").then().statusCode(400);
		given().auth().oauth2(token).queryParam("from", "01/11/2026")
			.when().get("/api/allocations").then().statusCode(400);
	}

	@Test
	void searchWithoutATokenIs401() {
		given().when().get("/api/allocations").then().statusCode(401);
	}

	// ---- approve (US-10)

	@Test
	void theEmployeesRmApprovesAndTheDecisionIsRecorded() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int allocation = propose(pm.token(),
				proposal(createRequest(pm.token(), createProject(pm.token())), newEmployee("Marko", rm), null, null,
						null));

		given().auth().oauth2(login(rm.getEmail()).token())
			.when().post("/api/allocations/" + allocation + "/approve")
			.then()
			.statusCode(200)
			.body("id", equalTo(allocation))
			.body("status", equalTo("APPROVED"))
			.body("decidedById", equalTo(rm.getId().intValue()))
			.body("decidedByName", equalTo("Team Test"))
			.body("decidedAt", notNullValue())
			.body("decisionComment", nullValue());
	}

	@Test
	void aCapacityBreachIs409WithTheDaysAndLeavesTheAllocationProposed() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		User marko = newEmployee("Marko", rm);
		int project = createProject(pm.token());
		String rmToken = login(rm.getEmail()).token();
		int first = propose(pm.token(), proposal(createRequest(pm.token(), project), marko, null, null, null));
		int second = propose(pm.token(), proposal(createRequest(pm.token(), project), marko, null, null, null));
		given().auth().oauth2(rmToken).when().post("/api/allocations/" + first + "/approve").then().statusCode(200);

		// 2 Nov 2026 is a Monday and 29 Jan 2027 a Friday, the first and last working days of the period
		given().auth().oauth2(rmToken)
			.when().post("/api/allocations/" + second + "/approve")
			.then()
			.statusCode(409)
			.body("code", equalTo("CAPACITY_EXCEEDED"))
			.body("message", equalTo("Capacity exceeded on 2026-11-02 – 2027-01-29 (60% existing + 60% new = 120%)"))
			.body("details[0].date", equalTo("2026-11-02"))
			.body("details[0].load", equalTo(120));
		assertThat(allocationRepository.findById((long) second).orElseThrow().getStatus())
			.isEqualTo(AllocationStatus.PROPOSED);
	}

	// ---- BR-5 / T-12, T-13

	@Test
	void anRmOfAnotherTeamCannotApprove() {
		LoggedIn pm = login(PM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", newUser("Team", Role.RM)), null, null, null));

		given().auth().oauth2(login(newUser("Other", Role.RM).getEmail()).token())
			.when().post("/api/allocations/" + allocation + "/approve")
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_RESOURCE_MANAGER"));
		assertThat(allocationRepository.findById((long) allocation).orElseThrow().getStatus())
			.isEqualTo(AllocationStatus.PROPOSED);
	}

	@Test
	void theEmployeeOrThePmCannotApprove() {
		LoggedIn pm = login(PM);
		User marko = newEmployee("Marko", newUser("Team", Role.RM));
		int allocation = propose(pm.token(),
				proposal(createRequest(pm.token(), createProject(pm.token())), marko, null, null, null));

		for (String token : List.of(login(marko.getEmail()).token(), pm.token())) {
			given().auth().oauth2(token)
				.when().post("/api/allocations/" + allocation + "/approve")
				.then()
				.statusCode(403);
		}
	}

	// ---- BR-7 / T-15

	@Test
	void anApprovedAllocationCannotBeApprovedAgain() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", rm), null, null, null));
		String rmToken = login(rm.getEmail()).token();
		given().auth().oauth2(rmToken).when().post("/api/allocations/" + allocation + "/approve").then().statusCode(200);

		given().auth().oauth2(rmToken)
			.when().post("/api/allocations/" + allocation + "/approve")
			.then()
			.statusCode(409)
			.body("code", equalTo("INVALID_ALLOCATION_STATUS"));
	}

	@Test
	void aProposalForADeactivatedEmployeeCannotBeApproved() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		User marko = newEmployee("Marko", rm);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())), marko,
				null, null, null));
		// Deactivation only checks active allocations (BR-12), so the proposal is still there
		marko.setActive(false);
		userRepository.save(marko);

		given().auth().oauth2(login(rm.getEmail()).token())
			.when().post("/api/allocations/" + allocation + "/approve")
			.then()
			.statusCode(409)
			.body("code", equalTo("EMPLOYEE_INACTIVE"));
		assertThat(allocationRepository.findById((long) allocation).orElseThrow().getStatus())
			.isEqualTo(AllocationStatus.PROPOSED);
	}

	@Test
	void approvingAnUnknownAllocationIs404AndWithoutATokenIs401() {
		given().auth().oauth2(login(RM).token())
			.when().post("/api/allocations/999999999/approve")
			.then()
			.statusCode(404);
		given().when().post("/api/allocations/1/approve").then().statusCode(401);
	}

	// ---- BR-10 / T-19, T-36

	@Test
	void approvalsFillTheRequestAndTheRemainingProposalsAreCancelled() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		int ana = propose(pm.token(), proposal(request, newEmployee("Ana", rm), null, null, null));
		int boris = propose(pm.token(), proposal(request, newEmployee("Boris", rm), null, null, null));
		int cedo = propose(pm.token(), proposal(request, newEmployee("Cedo", rm), null, null, null));
		String rmToken = login(rm.getEmail()).token();

		given().auth().oauth2(rmToken).when().post("/api/allocations/" + ana + "/approve").then().statusCode(200);
		assertThat(requestStatus(request)).isEqualTo(RequestStatus.PARTIALLY_FILLED);
		assertThat(allocationStatus(cedo)).isEqualTo(AllocationStatus.PROPOSED);

		// Headcount 2
		given().auth().oauth2(rmToken).when().post("/api/allocations/" + boris + "/approve").then().statusCode(200);
		assertThat(requestStatus(request)).isEqualTo(RequestStatus.FILLED);
		assertThat(allocationStatus(cedo)).isEqualTo(AllocationStatus.CANCELLED);
		given().auth().oauth2(rmToken)
			.when().post("/api/allocations/" + cedo + "/approve")
			.then().statusCode(409).body("code", equalTo("INVALID_ALLOCATION_STATUS"));
	}

	@Test
	void aChangePendingAllocationCountsAsActiveSoTheRequestIsFilled() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		int ana = propose(pm.token(), proposal(request, newEmployee("Ana", rm), null, null, null));
		int boris = propose(pm.token(), proposal(request, newEmployee("Boris", rm), null, null, null));
		String rmToken = login(rm.getEmail()).token();
		given().auth().oauth2(rmToken).when().post("/api/allocations/" + ana + "/approve").then().statusCode(200);
		// There is no change request endpoint yet (US-13)
		setAllocationStatus(ana, AllocationStatus.CHANGE_PENDING);

		given().auth().oauth2(rmToken).when().post("/api/allocations/" + boris + "/approve").then().statusCode(200);

		assertThat(requestStatus(request)).isEqualTo(RequestStatus.FILLED);
	}

	@Test
	void aRejectionDoesNotChangeTheRequestStatus() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int request = createRequest(pm.token(), createProject(pm.token()));
		int ana = propose(pm.token(), proposal(request, newEmployee("Ana", rm), null, null, null));
		int boris = propose(pm.token(), proposal(request, newEmployee("Boris", rm), null, null, null));
		String rmToken = login(rm.getEmail()).token();
		given().auth().oauth2(rmToken).when().post("/api/allocations/" + ana + "/approve").then().statusCode(200);

		given().auth().oauth2(rmToken).contentType(ContentType.JSON)
			.body(Map.of("comment", "Fully booked on Project Beta until December"))
			.when().post("/api/allocations/" + boris + "/reject").then().statusCode(200);

		assertThat(requestStatus(request)).isEqualTo(RequestStatus.PARTIALLY_FILLED);
	}

	// ---- reject (US-10)

	@Test
	void theEmployeesRmRejectsWithAComment() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", rm), null, null, null));

		given().auth().oauth2(login(rm.getEmail()).token()).contentType(ContentType.JSON)
			.body(Map.of("comment", "Fully booked on Project Beta until December"))
			.when().post("/api/allocations/" + allocation + "/reject")
			.then()
			.statusCode(200)
			.body("status", equalTo("REJECTED"))
			.body("decidedById", equalTo(rm.getId().intValue()))
			.body("decidedAt", notNullValue())
			.body("decisionComment", equalTo("Fully booked on Project Beta until December"));
	}

	// ---- BR-6 / T-14

	@ParameterizedTest
	@ValueSource(strings = { "", "          ", "Too short" })
	void aBlankOrShortCommentIs400AndTheAllocationStaysProposed(String comment) {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", rm), null, null, null));

		given().auth().oauth2(login(rm.getEmail()).token()).contentType(ContentType.JSON)
			.body(Map.of("comment", comment))
			.when().post("/api/allocations/" + allocation + "/reject")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("comment"));
		assertThat(allocationRepository.findById((long) allocation).orElseThrow().getStatus())
			.isEqualTo(AllocationStatus.PROPOSED);
	}

	@Test
	void aMissingCommentIs400() {
		given().auth().oauth2(login(RM).token()).contentType(ContentType.JSON).body(Map.of())
			.when().post("/api/allocations/1/reject")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", hasItem("comment"));
	}

	// ---- BR-5, BR-7 on reject

	@Test
	void anRmOfAnotherTeamCannotReject() {
		LoggedIn pm = login(PM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", newUser("Team", Role.RM)), null, null, null));

		given().auth().oauth2(login(newUser("Other", Role.RM).getEmail()).token()).contentType(ContentType.JSON)
			.body(Map.of("comment", "Fully booked on Project Beta until December"))
			.when().post("/api/allocations/" + allocation + "/reject")
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_RESOURCE_MANAGER"));
	}

	@Test
	void aRejectedAllocationCannotBeDecidedAgain() {
		LoggedIn pm = login(PM);
		User rm = newUser("Team", Role.RM);
		int allocation = propose(pm.token(), proposal(createRequest(pm.token(), createProject(pm.token())),
				newEmployee("Marko", rm), null, null, null));
		String rmToken = login(rm.getEmail()).token();
		Map<String, String> body = Map.of("comment", "Fully booked on Project Beta until December");
		given().auth().oauth2(rmToken).contentType(ContentType.JSON).body(body)
			.when().post("/api/allocations/" + allocation + "/reject").then().statusCode(200);

		given().auth().oauth2(rmToken).contentType(ContentType.JSON).body(body)
			.when().post("/api/allocations/" + allocation + "/reject")
			.then().statusCode(409).body("code", equalTo("INVALID_ALLOCATION_STATUS"));
		given().auth().oauth2(rmToken)
			.when().post("/api/allocations/" + allocation + "/approve")
			.then().statusCode(409).body("code", equalTo("INVALID_ALLOCATION_STATUS"));
	}

	// ---- helpers

	private record Scenario(LoggedIn pmA, LoggedIn pmB, User rm, User ena, User filip, int projectA, int projectB,
			int enaOnA, int filipOnA, int enaOnB) {

	}

	/** BR-7 transitions come with approvals (US-10), so tests set the status directly. */
	private void setAllocationStatus(int id, AllocationStatus status) {
		Allocation allocation = allocationRepository.findById((long) id).orElseThrow();
		allocation.setStatus(status);
		allocationRepository.save(allocation);
	}

	private AllocationStatus allocationStatus(int id) {
		return allocationRepository.findById((long) id).orElseThrow().getStatus();
	}

	private RequestStatus requestStatus(int id) {
		return requestRepository.findById((long) id).orElseThrow().getStatus();
	}

	private Map<String, Object> proposal(int request, User employee, Integer percent, String start, String end) {
		Map<String, Object> body = new HashMap<>();
		body.put("requestId", request);
		body.put("employeeId", employee.getId());
		body.put("percent", percent);
		body.put("startDate", start);
		body.put("endDate", end);
		return body;
	}

	private int propose(String token, Map<String, Object> body) {
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().post("/api/allocations")
			.then().statusCode(201).extract().path("allocation.id");
	}

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
		skill.put("skillId", skillByName(name).getId());
		skill.put("minLevel", level);
		skill.put("mandatory", mandatory);
		return skill;
	}

	/** The catalog is seeded by a migration, so "Java", "Spring" and "PostgreSQL" are always there. */
	private Skill skillByName(String name) {
		return skillRepository.findAll().stream().filter(skill -> skill.getName().equals(name)).findFirst()
			.orElseThrow();
	}

	private int createProject(String token) {
		return given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "Project-" + UUID.randomUUID(), "client", "Acme", "startDate", "2026-11-01",
					"endDate", "2027-03-31"))
			.when().post("/api/projects")
			.then().statusCode(201).extract().path("id");
	}

	private int createRequest(String token, int project) {
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(demoRequest())
			.when().post("/api/projects/" + project + "/requests")
			.then().statusCode(201).extract().path("id");
	}

	/** There is no status endpoint for projects yet (US-24), so tests set it directly. */
	private void setProjectStatus(int id, ProjectStatus status) {
		Project project = projectRepository.findById((long) id).orElseThrow();
		project.setStatus(status);
		projectRepository.save(project);
	}

	/** BR-10 sets this once approvals exist (US-10), so tests set it directly. */
	private void setRequestStatus(int id, RequestStatus status) {
		StaffingRequest request = requestRepository.findById((long) id).orElseThrow();
		request.setStatus(status);
		requestRepository.save(request);
	}

	/** A new EMPLOYEE with Java 5 and Spring 4, which meets the demo request's required skills. */
	private User newEmployee(String firstName) {
		return newEmployee(firstName, Map.of("Java", 5, "Spring", 4));
	}

	/** Like {@link #newEmployee(String)}, in the team of this RM. */
	private User newEmployee(String firstName, User manager) {
		User employee = newEmployee(firstName);
		employee.setManager(manager);
		return userRepository.save(employee);
	}

	private User newEmployee(String firstName, Map<String, Integer> skills) {
		User employee = newUser(firstName, Role.EMPLOYEE);
		skills.forEach((name, level) -> employeeSkillRepository
			.save(new EmployeeSkill(employee, skillByName(name), level, 1)));
		return employee;
	}

	private User newUser(String firstName, Role role) {
		String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@staffsync.local";
		return userRepository.save(new User(email, passwordEncoder.encode(PASSWORD), firstName, "Test", role));
	}

	/** A second PM, because the dev seed has only one. */
	private LoggedIn newPm() {
		return login(newUser("Other", Role.PM).getEmail());
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
