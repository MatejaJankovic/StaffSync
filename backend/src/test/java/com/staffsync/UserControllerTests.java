package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/** {@code /api/users} (US-18). Every test makes its own users, so they don't see each other's changes. */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	private static final String RM = "lazar_rm@staffsync.local";

	private static final String PM = "mateja_pm@staffsync.local";

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
	DepartmentRepository departmentRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	// ---- list

	@ParameterizedTest
	@ValueSource(strings = { ADMIN, RM })
	void adminAndRmCanListUsers(String email) {
		given().auth().oauth2(tokenFor(email))
			.when().get("/api/users")
			.then()
			.statusCode(200)
			.body("content.email", hasItem(RM))
			.body("page.totalElements", notNullValue());
	}

	@ParameterizedTest
	@ValueSource(strings = { "mateja_pm@staffsync.local", "bogdan_employee@staffsync.local" })
	void otherRolesCantListUsers(String email) {
		given().auth().oauth2(tokenFor(email)).when().get("/api/users").then().statusCode(403);
	}

	@Test
	void listingWithoutTokenIs401() {
		given().when().get("/api/users").then().statusCode(401);
	}

	@Test
	void theListNeverContainsThePasswordHash() {
		String body = given().auth().oauth2(tokenFor(ADMIN))
			.when().get("/api/users")
			.then().statusCode(200)
			.extract().asString();

		assertThat(body).doesNotContain("password").doesNotContain("$2a$");
	}

	@Test
	void listFiltersByDepartment() {
		Department department = newDepartment();
		User inside = newEmployee("Inside", department, rm());

		given().auth().oauth2(tokenFor(ADMIN)).queryParam("departmentId", department.getId())
			.when().get("/api/users")
			.then()
			.statusCode(200)
			.body("content.id", containsInAnyOrder(inside.getId().intValue()))
			.body("content[0].department.name", equalTo(department.getName()))
			.body("content[0].manager.firstName", equalTo("Lazar"));
	}

	@Test
	void listFiltersByRoleAndActiveStatus() {
		User inactive = newEmployee("Gone", engineering(), rm());
		inactive.setActive(false);
		userRepository.save(inactive);

		given().auth().oauth2(tokenFor(ADMIN))
			.queryParam("role", "EMPLOYEE").queryParam("active", false).queryParam("size", 100)
			.when().get("/api/users")
			.then()
			.statusCode(200)
			.body("content.id", hasItem(inactive.getId().intValue()))
			.body("content.role", everyItem(equalTo("EMPLOYEE")))
			.body("content.active", everyItem(equalTo(false)));
	}

	@Test
	void listIsPagedAndSortable() {
		given().auth().oauth2(tokenFor(ADMIN))
			.queryParam("size", 2).queryParam("sort", "email,asc")
			.when().get("/api/users")
			.then()
			.statusCode(200)
			.body("content.size()", equalTo(2))
			.body("page.size", equalTo(2));
	}

	@Test
	void unknownSortPropertyIs400() {
		given().auth().oauth2(tokenFor(ADMIN)).queryParam("sort", "passwordHash")
			.when().get("/api/users")
			.then().statusCode(400).body("code", equalTo("INVALID_SORT"));
	}

	// ---- create

	@Test
	void adminCreatesAnEmployeeWhoCanLogInWithTheTemporaryPassword() {
		String email = uniqueEmail();
		Map<String, Object> body = employeeBody(email);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then()
			.statusCode(201)
			.body("id", notNullValue())
			.body("email", equalTo(email))
			.body("firstName", equalTo("Jelena"))
			.body("role", equalTo("EMPLOYEE"))
			.body("department.id", equalTo(engineering().getId().intValue()))
			.body("manager.id", equalTo(rm().getId().intValue()))
			.body("seniority", equalTo("MEDIOR"))
			.body("capacityPercent", equalTo(80))
			.body("active", equalTo(true))
			.body("passwordHash", nullValue())
			.body("temporaryPassword", nullValue());

		given().contentType(ContentType.JSON).body(Map.of("email", email, "password", "Welcome2026!"))
			.when().post("/api/auth/login")
			.then().statusCode(200).body("user.email", equalTo(email));
	}

	@Test
	void adminCreatesAPmWithoutDepartmentOrManager() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("role", "PM");
		body.put("departmentId", null);
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(201).body("role", equalTo("PM")).body("manager", nullValue());
	}

	@Test
	void emailIsUniqueRegardlessOfCase() {
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON)
			.body(employeeBody("LAZAR_RM@staffsync.local"))
			.when().post("/api/users")
			.then().statusCode(409).body("code", equalTo("EMAIL_TAKEN"));
	}

	@Test
	void capacityMustBe100Or80Or50() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("capacityPercent", 70);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", containsInAnyOrder("capacityPercent"));
	}

	@Test
	void anEmployeeNeedsADepartmentAndAManager() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("departmentId", null);
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then()
			.statusCode(400)
			.body("details.field", containsInAnyOrder("departmentId", "managerId"));
	}

	@Test
	void theManagerMustBeAnRm() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("managerId", userRepository.findByEmailIgnoreCase("mateja_pm@staffsync.local").orElseThrow().getId());

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(400).body("details.field", containsInAnyOrder("managerId"));
	}

	@Test
	void theManagerMustBeActive() {
		User formerRm = newUser("Former", Role.RM);
		formerRm.setActive(false);
		userRepository.save(formerRm);
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("managerId", formerRm.getId());

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(400).body("details.field", containsInAnyOrder("managerId"));
	}

	@Test
	void onlyAnEmployeeHasAManager() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("role", "PM");

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(400).body("details.field", containsInAnyOrder("managerId"));
	}

	@Test
	void anUnknownDepartmentIs400() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("departmentId", 999_999);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(400).body("details.field", containsInAnyOrder("departmentId"));
	}

	@Test
	void aMissingOrShortTemporaryPasswordIs400() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("temporaryPassword", "short");

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(400).body("details.field", containsInAnyOrder("temporaryPassword"));
	}

	@Test
	void aTemporaryPasswordOver72BytesIs400EvenWithFewerCharacters() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		// 40 characters but 80 bytes: č takes two bytes in UTF-8, and BCrypt can't hash more than 72
		body.put("temporaryPassword", "č".repeat(40));

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", containsInAnyOrder("temporaryPassword"));
	}

	@Test
	void aTemporaryPasswordOfExactly72BytesWorks() {
		String email = uniqueEmail();
		String password = "č".repeat(36);
		Map<String, Object> body = employeeBody(email);
		body.put("temporaryPassword", password);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then().statusCode(201);

		given().contentType(ContentType.JSON).body(Map.of("email", email, "password", password))
			.when().post("/api/auth/login")
			.then().statusCode(200);
	}

	@Test
	void aTooLongPasswordIsReportedWithTheOtherFieldErrors() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.put("temporaryPassword", "č".repeat(40));
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().post("/api/users")
			.then()
			.statusCode(400)
			.body("details.field", containsInAnyOrder("temporaryPassword", "managerId"));
	}

	@Test
	void aNonAdminGets403EvenWithAnInvalidBody() {
		given().auth().oauth2(tokenFor(RM)).contentType(ContentType.JSON).body(Map.of())
			.when().post("/api/users")
			.then().statusCode(403);
	}

	// ---- update

	@Test
	void adminEditsAUser() {
		User user = newEmployee("Before", engineering(), rm());
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.remove("temporaryPassword");
		body.put("firstName", "After");
		body.put("seniority", "SENIOR");
		body.put("capacityPercent", 100);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + user.getId())
			.then()
			.statusCode(200)
			.body("firstName", equalTo("After"))
			.body("email", equalTo(body.get("email")))
			.body("seniority", equalTo("SENIOR"))
			.body("capacityPercent", equalTo(100));

		// The password is not touched by an edit
		given().contentType(ContentType.JSON).body(Map.of("email", body.get("email"), "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200);
	}

	@Test
	void editKeepingTheSameEmailIsAllowed() {
		User user = newEmployee("Same", engineering(), rm());
		Map<String, Object> body = employeeBody(user.getEmail().toUpperCase());
		body.remove("temporaryPassword");

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + user.getId())
			.then().statusCode(200);
	}

	@Test
	void editToAnotherUsersEmailIs409() {
		User user = newEmployee("Taken", engineering(), rm());
		Map<String, Object> body = employeeBody(RM);
		body.remove("temporaryPassword");

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + user.getId())
			.then().statusCode(409).body("code", equalTo("EMAIL_TAKEN"));
	}

	@Test
	void editingAnUnknownUserIs404() {
		Map<String, Object> body = employeeBody(uniqueEmail());
		body.remove("temporaryPassword");

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/999999")
			.then().statusCode(404);
	}

	@Test
	void aNonAdminCantEdit() {
		User user = newEmployee("Locked", engineering(), rm());

		given().auth().oauth2(tokenFor(RM)).contentType(ContentType.JSON).body(Map.of())
			.when().put("/api/users/" + user.getId())
			.then().statusCode(403);
	}

	// ---- BR-13 / T-23: lowering capacity

	@Test
	void loweringCapacityBelowTheActiveAllocationsIs409WithTheDays() {
		User employee = newEmployee("Busy", engineering(), rm());
		LocalDate monday = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
		// Monday to Friday of the next week: 10 working days at 80%
		allocate(employee, 80, monday, monday.plusDays(11), AllocationStatus.APPROVED);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(editBody(employee, 50))
			.when().put("/api/users/" + employee.getId())
			.then()
			.statusCode(409)
			.body("code", equalTo("CAPACITY_EXCEEDED"))
			.body("message", equalTo("Lowering capacity to 50% would overbook " + monday + " – " + monday.plusDays(11)
					+ " (80% allocated)"))
			.body("details.size()", equalTo(10))
			.body("details[0].date", equalTo(monday.toString()))
			.body("details[0].load", equalTo(80));

		assertThat(userRepository.findById(employee.getId()).orElseThrow().getCapacityPercent()).isEqualTo(100);
	}

	@Test
	void aChangePendingAllocationCountsWithItsCurrentValues() {
		User employee = newEmployee("Pending", engineering(), rm());
		LocalDate monday = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
		allocate(employee, 60, monday, monday.plusDays(4), AllocationStatus.CHANGE_PENDING);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(editBody(employee, 50))
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(409).body("code", equalTo("CAPACITY_EXCEEDED"));
	}

	@Test
	void loweringCapacityToExactlyTheLoadIsAllowed() {
		User employee = newEmployee("Exact", engineering(), rm());
		LocalDate monday = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
		allocate(employee, 80, monday, monday.plusDays(4), AllocationStatus.APPROVED);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(editBody(employee, 80))
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(200).body("capacityPercent", equalTo(80));
	}

	@Test
	void pastAndProposedAllocationsDontBlockLoweringCapacity() {
		User employee = newEmployee("Free", engineering(), rm());
		LocalDate today = LocalDate.now();
		allocate(employee, 100, today.minusDays(30), today.minusDays(1), AllocationStatus.APPROVED);
		allocate(employee, 100, today.plusDays(1), today.plusDays(30), AllocationStatus.PROPOSED);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(editBody(employee, 50))
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(200).body("capacityPercent", equalTo(50));
	}

	@Test
	void raisingCapacityIsNeverChecked() {
		User employee = newEmployee("Grow", engineering(), rm());
		employee.setCapacityPercent(50);
		userRepository.save(employee);
		LocalDate monday = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
		// Already over 50%, e.g. from before a reduction rule existed
		allocate(employee, 90, monday, monday.plusDays(4), AllocationStatus.APPROVED);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(editBody(employee, 80))
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(200).body("capacityPercent", equalTo(80));
	}

	// ---- BR-12 / T-22, T-37: deactivation

	@Test
	void aUserWithAnApprovedAllocationEndingTodayCantBeDeactivated() {
		User employee = newEmployee("Today", engineering(), rm());
		LocalDate today = LocalDate.now();
		allocate(employee, 50, today.minusDays(10), today, AllocationStatus.APPROVED);

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(409).body("code", equalTo("USER_HAS_ACTIVE_ALLOCATIONS"));

		assertThat(userRepository.findById(employee.getId()).orElseThrow().isActive()).isTrue();
	}

	@Test
	void aUserWithAFutureChangePendingAllocationCantBeDeactivated() {
		User employee = newEmployee("Future", engineering(), rm());
		LocalDate today = LocalDate.now();
		allocate(employee, 50, today.plusDays(10), today.plusDays(20), AllocationStatus.CHANGE_PENDING);

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(409).body("code", equalTo("USER_HAS_ACTIVE_ALLOCATIONS"));
	}

	@Test
	void aDeactivatedUserCantLogInAndTheirTokenStopsWorking() {
		User employee = newEmployee("Leaver", engineering(), rm());
		LocalDate today = LocalDate.now();
		// Neither a finished nor a proposed allocation is active (BR-12)
		allocate(employee, 50, today.minusDays(20), today.minusDays(1), AllocationStatus.APPROVED);
		allocate(employee, 50, today.plusDays(1), today.plusDays(20), AllocationStatus.PROPOSED);
		String oldToken = tokenFor(employee.getEmail());

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(200).body("active", equalTo(false));

		given().contentType(ContentType.JSON).body(Map.of("email", employee.getEmail(), "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(401);
		given().auth().oauth2(oldToken).when().get("/api/auth/me").then().statusCode(401);
	}

	@Test
	void deactivatingAnInactiveUserChangesNothing() {
		User employee = newEmployee("Twice", engineering(), rm());
		String admin = tokenFor(ADMIN);

		given().auth().oauth2(admin).when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(200);
		given().auth().oauth2(admin).when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(200).body("active", equalTo(false));
	}

	@Test
	void anAdminCantDeactivateThemself() {
		User admin = userRepository.findByEmailIgnoreCase(ADMIN).orElseThrow();

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + admin.getId() + "/deactivate")
			.then().statusCode(409).body("code", equalTo("CANNOT_DEACTIVATE_SELF"));
	}

	@Test
	void anRmWithActiveEmployeesCantBeDeactivated() {
		User rm = newUser("Lead", Role.RM);
		newEmployee("Member", engineering(), rm);

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + rm.getId() + "/deactivate")
			.then().statusCode(409).body("code", equalTo("RM_HAS_TEAM"));
	}

	@Test
	void anRmWhoseEmployeesAreAllInactiveCanBeDeactivated() {
		User rm = newUser("Alone", Role.RM);
		User member = newEmployee("Former", engineering(), rm);
		member.setActive(false);
		userRepository.save(member);

		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/" + rm.getId() + "/deactivate")
			.then().statusCode(200).body("active", equalTo(false));
	}

	@Test
	void anRmWithActiveEmployeesKeepsTheRmRole() {
		User rm = newUser("Keep", Role.RM);
		newEmployee("Member", engineering(), rm);
		Map<String, Object> body = editBody(rm, 100);
		body.put("role", "PM");
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + rm.getId())
			.then().statusCode(409).body("code", equalTo("RM_HAS_TEAM"));
	}

	@Test
	void anAdminCantChangeTheirOwnRole() {
		User admin = userRepository.findByEmailIgnoreCase(ADMIN).orElseThrow();
		Map<String, Object> body = editBody(admin, admin.getCapacityPercent());
		body.put("lastName", admin.getLastName());

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + admin.getId())
			.then().statusCode(409).body("code", equalTo("CANNOT_CHANGE_OWN_ROLE"));

		assertThat(userRepository.findById(admin.getId()).orElseThrow().getRole()).isEqualTo(Role.ADMIN);
	}

	@Test
	void anEmployeeWithAFutureProposalKeepsTheEmployeeRole() {
		User employee = newEmployee("Proposed", engineering(), rm());
		LocalDate today = LocalDate.now();
		// Only their RM can decide on it (BR-5), and a PM has none
		allocate(employee, 50, today.plusDays(10), today.plusDays(20), AllocationStatus.PROPOSED);
		Map<String, Object> body = editBody(employee, 80);
		body.put("role", "PM");
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(409).body("code", equalTo("USER_HAS_ACTIVE_ALLOCATIONS"));

		User saved = userRepository.findById(employee.getId()).orElseThrow();
		assertThat(saved.getRole()).isEqualTo(Role.EMPLOYEE);
		assertThat(saved.getManager()).isNotNull();
	}

	@Test
	void anEmployeeWhoseAllocationsHaveEndedCanGetAnotherRole() {
		User employee = newEmployee("Promoted", engineering(), rm());
		LocalDate today = LocalDate.now();
		allocate(employee, 50, today.minusDays(20), today.minusDays(1), AllocationStatus.APPROVED);
		Map<String, Object> body = editBody(employee, 80);
		body.put("role", "PM");
		body.put("managerId", null);

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(200).body("role", equalTo("PM")).body("manager", nullValue());
	}

	@Test
	void anInactiveEmployeeKeepsTheirDeactivatedRmWhenEdited() {
		User formerRm = newUser("Gone", Role.RM);
		User employee = newEmployee("Archived", engineering(), formerRm);
		employee.setActive(false);
		userRepository.save(employee);
		formerRm.setActive(false);
		userRepository.save(formerRm);
		Map<String, Object> body = editBody(employee, 80);
		body.put("lastName", "Fixed");
		body.put("managerId", formerRm.getId());

		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + employee.getId())
			.then()
			.statusCode(200)
			.body("lastName", equalTo("Fixed"))
			.body("manager.id", equalTo(formerRm.getId().intValue()));

		// Picking a deactivated RM is still refused when it is a change
		body.put("managerId", newDeactivatedRm().getId());
		given().auth().oauth2(tokenFor(ADMIN)).contentType(ContentType.JSON).body(body)
			.when().put("/api/users/" + employee.getId())
			.then().statusCode(400).body("details.field", containsInAnyOrder("managerId"));
	}

	@Test
	void aNonAdminCantDeactivate() {
		User employee = newEmployee("Safe", engineering(), rm());

		given().auth().oauth2(tokenFor(RM))
			.when().patch("/api/users/" + employee.getId() + "/deactivate")
			.then().statusCode(403);
	}

	@Test
	void deactivatingAnUnknownUserIs404() {
		given().auth().oauth2(tokenFor(ADMIN))
			.when().patch("/api/users/999999/deactivate")
			.then().statusCode(404);
	}

	// ---- US-21: my team

	@Test
	void anRmGetsExactlyTheirActiveTeamWithTodaysLoadAndFreeCapacity() {
		User rm = newUser("Igor", Role.RM);
		Department department = newDepartment();
		LocalDate day = CapacityService.workingDayFrom(LocalDate.now());
		User busy = newEmployee("Busy", department, rm);
		busy.setCapacityPercent(80);
		busy.setSeniority(Seniority.SENIOR);
		userRepository.save(busy);
		User bench = newEmployee("Bench", department, rm);
		User former = newEmployee("Former", department, rm);
		former.setActive(false);
		userRepository.save(former);
		User otherTeam = newEmployee("Other", department, newUser("Other", Role.RM));
		allocate(busy, 40, day.minusDays(30), day.plusDays(60), AllocationStatus.APPROVED);
		// A pending change counts with its current values (BR-16), a proposal doesn't count yet
		allocate(busy, 20, day.minusDays(30), day.plusDays(60), AllocationStatus.CHANGE_PENDING);
		allocate(bench, 50, day.minusDays(30), day.plusDays(60), AllocationStatus.PROPOSED);
		allocate(otherTeam, 50, day.minusDays(30), day.plusDays(60), AllocationStatus.APPROVED);

		// Both are "Test", so the first name decides: Bench before Busy
		given().auth().oauth2(tokenFor(rm.getEmail()))
			.when().get("/api/users/me/team")
			.then()
			.statusCode(200)
			.body("id", contains(bench.getId().intValue(), busy.getId().intValue()))
			.body("load", contains(0, 60))
			.body("free", contains(100, 20))
			.body("capacityPercent", contains(100, 80))
			.body("[1].seniority", equalTo("SENIOR"))
			.body("[1].department.name", equalTo(department.getName()))
			.body("[1].email", nullValue());
	}

	@Test
	void anRmWithoutATeamGetsAnEmptyList() {
		User rm = newUser("Lonely", Role.RM);

		given().auth().oauth2(tokenFor(rm.getEmail()))
			.when().get("/api/users/me/team")
			.then().statusCode(200).body("size()", equalTo(0));
	}

	@ParameterizedTest
	@ValueSource(strings = { ADMIN, PM, "bogdan_employee@staffsync.local" })
	void onlyAnRmHasATeam(String email) {
		given().auth().oauth2(tokenFor(email))
			.when().get("/api/users/me/team")
			.then().statusCode(403);
	}

	@Test
	void myTeamWithoutTokenIs401() {
		given().when().get("/api/users/me/team").then().statusCode(401);
	}

	@Test
	void myTeamHasTheSameLoadsAsTheRmHomeCards() {
		User rm = newUser("Igor", Role.RM);
		Department department = newDepartment();
		LocalDate day = CapacityService.workingDayFrom(LocalDate.now());
		User busy = newEmployee("Busy", department, rm);
		User partly = newEmployee("Partly", department, rm);
		newEmployee("Bench", department, rm);
		allocate(busy, 60, day.minusDays(30), day.plusDays(60), AllocationStatus.APPROVED);
		allocate(partly, 20, day.minusDays(30), day.plusDays(60), AllocationStatus.CHANGE_PENDING);
		String token = tokenFor(rm.getEmail());

		// #75: the page matches the Home cards, so the same team and loads give the same average: 80 / 3 = 27%
		given().auth().oauth2(token)
			.when().get("/api/users/me/team")
			.then().statusCode(200).body("load", containsInAnyOrder(60, 20, 0));
		given().auth().oauth2(token)
			.when().get("/api/dashboard")
			.then().statusCode(200).body("find { it.key == 'averageLoad' }.value", equalTo("27%"));
	}

	// ---- US-16: availability

	@Test
	void availabilityGivesTheSection7LoadAndFreeCapacityPerWorkingDay() {
		User marko = newEmployee("Marko", newDepartment(), rm());
		allocate(marko, 60, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 12, 15), AllocationStatus.APPROVED);
		allocate(marko, 30, LocalDate.of(2026, 11, 10), LocalDate.of(2026, 12, 31), AllocationStatus.APPROVED);

		// Nov 5–20 has 12 working days: Nov 5, 6 and 9 with A only, Nov 10–20 with A and B. No weekends
		given().auth().oauth2(tokenFor(PM))
			.queryParam("from", "2026-11-05").queryParam("to", "2026-11-20")
			.when().get("/api/users/{id}/availability", marko.getId())
			.then()
			.statusCode(200)
			.body("employeeId", equalTo(marko.getId().intValue()))
			.body("capacityPercent", equalTo(100))
			.body("from", equalTo("2026-11-05"))
			.body("to", equalTo("2026-11-20"))
			.body("days.date", contains("2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11",
					"2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"))
			.body("days.load", contains(60, 60, 60, 90, 90, 90, 90, 90, 90, 90, 90, 90))
			.body("days.free", contains(40, 40, 40, 10, 10, 10, 10, 10, 10, 10, 10, 10));
	}

	@Test
	void availabilityCountsOnlyActiveAllocationsAgainstTheEmployeesOwnCapacity() {
		User employee = newEmployee("Part", newDepartment(), rm());
		employee.setCapacityPercent(50);
		userRepository.save(employee);
		LocalDate monday = LocalDate.of(2026, 11, 2);
		// A pending change counts with its current values (BR-16); proposals, rejections and cancellations don't
		allocate(employee, 20, monday, monday, AllocationStatus.APPROVED);
		allocate(employee, 10, monday, monday, AllocationStatus.CHANGE_PENDING);
		allocate(employee, 30, monday, monday, AllocationStatus.PROPOSED);
		allocate(employee, 30, monday, monday, AllocationStatus.REJECTED);
		allocate(employee, 30, monday, monday, AllocationStatus.CANCELLED);

		given().auth().oauth2(tokenFor(RM))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-02")
			.when().get("/api/users/{id}/availability", employee.getId())
			.then()
			.statusCode(200)
			.body("capacityPercent", equalTo(50))
			.body("days.load", contains(30))
			.body("days.free", contains(20));
	}

	@Test
	void anEmployeeSeesTheirOwnAvailability() {
		User employee = newEmployee("Own", newDepartment(), rm());

		given().auth().oauth2(tokenFor(employee.getEmail()))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", employee.getId())
			.then().statusCode(200).body("days.free", everyItem(equalTo(100)));
	}

	@Test
	void aPendingChangeCountsWithItsCurrentValuesNotThePendingOnes() {
		User employee = newEmployee("Pending", newDepartment(), rm());
		// 40% for Nov 2–6, with a change to 80% until Nov 13 waiting for the RM (BR-15)
		Allocation allocation = allocate(employee, 40, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 6),
				AllocationStatus.APPROVED);
		allocation.requestChange(80, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 13), "Scope grew");
		allocationRepository.save(allocation);

		// BR-16: until the change is approved, Nov 2–6 stay at 40% and Nov 9–13 stay free
		given().auth().oauth2(tokenFor(PM))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-13")
			.when().get("/api/users/{id}/availability", employee.getId())
			.then()
			.statusCode(200)
			.body("days.load", contains(40, 40, 40, 40, 40, 0, 0, 0, 0, 0))
			.body("days.free", contains(60, 60, 60, 60, 60, 100, 100, 100, 100, 100));
	}

	@Test
	void anRmWhoIsNotTheEmployeesManagerSeesTheirAvailabilityToo() {
		// §10 grants any RM; BR-5 scopes decisions to the employee's own RM, not reading capacity
		User employee = newEmployee("Other", newDepartment(), rm());
		User otherRm = newUser("Other", Role.RM);

		given().auth().oauth2(tokenFor(otherRm.getEmail()))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", employee.getId())
			.then().statusCode(200).body("days.free", everyItem(equalTo(100)));
	}

	@ParameterizedTest
	@ValueSource(strings = { ADMIN, "bogdan_employee@staffsync.local" })
	void noOneElseSeesAnEmployeesAvailability(String email) {
		User employee = newEmployee("Private", newDepartment(), rm());

		given().auth().oauth2(tokenFor(email))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", employee.getId())
			.then().statusCode(403);
	}

	@Test
	void availabilityWithoutTokenIs401() {
		given().queryParam("from", "2026-11-02").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", rm().getId())
			.then().statusCode(401);
	}

	@Test
	void availabilityNeedsFromAndTo() {
		String token = tokenFor(PM);
		Long id = rm().getId();

		// Spring MVC rejects a missing or malformed query parameter, so the code is the status name (§10)
		given().auth().oauth2(token)
			.queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", id)
			.then().statusCode(400).body("code", equalTo("BAD_REQUEST"));
		given().auth().oauth2(token)
			.queryParam("from", "next monday").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", id)
			.then().statusCode(400).body("code", equalTo("BAD_REQUEST"));
	}

	@Test
	void availabilityFromAfterToIs400() {
		given().auth().oauth2(tokenFor(PM))
			.queryParam("from", "2026-11-06").queryParam("to", "2026-11-02")
			.when().get("/api/users/{id}/availability", rm().getId())
			.then().statusCode(400).body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void availabilityIsAtMostAYear() {
		String token = tokenFor(PM);
		Long id = rm().getId();

		given().auth().oauth2(token)
			.queryParam("from", "2026-11-02").queryParam("to", "2027-11-02")
			.when().get("/api/users/{id}/availability", id)
			.then().statusCode(200);
		given().auth().oauth2(token)
			.queryParam("from", "2026-11-02").queryParam("to", "2027-11-03")
			.when().get("/api/users/{id}/availability", id)
			.then().statusCode(400).body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void availabilityOfAWeekendHasNoDays() {
		given().auth().oauth2(tokenFor(PM))
			.queryParam("from", "2026-11-07").queryParam("to", "2026-11-08")
			.when().get("/api/users/{id}/availability", rm().getId())
			.then().statusCode(200).body("days.size()", equalTo(0));
	}

	@Test
	void availabilityOfAnUnknownUserIs404() {
		given().auth().oauth2(tokenFor(PM))
			.queryParam("from", "2026-11-02").queryParam("to", "2026-11-06")
			.when().get("/api/users/{id}/availability", Long.MAX_VALUE)
			.then().statusCode(404);
	}

	// ---- helpers

	/** The user's own fields with a new capacity, as the *Edit* dialog sends them. */
	private Map<String, Object> editBody(User user, int capacityPercent) {
		Map<String, Object> body = employeeBody(user.getEmail());
		body.remove("temporaryPassword");
		body.put("firstName", user.getFirstName());
		body.put("capacityPercent", capacityPercent);
		return body;
	}

	/** Allocation transitions belong to US-10 and US-12, so tests save the allocation with its status. */
	private Allocation allocate(User employee, int percent, LocalDate start, LocalDate end,
			AllocationStatus status) {
		User pm = userRepository.findByEmailIgnoreCase(PM).orElseThrow();
		Project project = projectRepository
			.save(new Project("Project-" + UUID.randomUUID(), "Acme", null, start, end, pm));
		StaffingRequest request = requestRepository
			.save(new StaffingRequest(project, "Developer", Seniority.MEDIOR, percent, start, end, 1));
		Allocation allocation = new Allocation(request, employee, percent, start, end, pm);
		allocation.setStatus(status);
		return allocationRepository.save(allocation);
	}

	private Map<String, Object> employeeBody(String email) {
		Map<String, Object> body = new HashMap<>();
		body.put("email", email);
		body.put("firstName", "Jelena");
		body.put("lastName", "Petrovic");
		body.put("role", "EMPLOYEE");
		body.put("departmentId", engineering().getId());
		body.put("managerId", rm().getId());
		body.put("seniority", "MEDIOR");
		body.put("capacityPercent", 80);
		body.put("temporaryPassword", "Welcome2026!");
		return body;
	}

	private Department engineering() {
		return departmentRepository.findAll().stream()
			.filter(department -> department.getName().equals("Engineering"))
			.findFirst().orElseThrow();
	}

	private Department newDepartment() {
		return departmentRepository.save(new Department("Dept-" + UUID.randomUUID().toString().substring(0, 8)));
	}

	private User rm() {
		return userRepository.findByEmailIgnoreCase(RM).orElseThrow();
	}

	private User newEmployee(String firstName, Department department, User manager) {
		User employee = newUser(firstName, Role.EMPLOYEE);
		employee.setDepartment(department);
		employee.setManager(manager);
		return userRepository.save(employee);
	}

	private User newDeactivatedRm() {
		User rm = newUser("Former", Role.RM);
		rm.setActive(false);
		return userRepository.save(rm);
	}

	private User newUser(String firstName, Role role) {
		return userRepository.save(new User(uniqueEmail(), passwordEncoder.encode(PASSWORD), firstName, "Test", role));
	}

	private static String uniqueEmail() {
		return "user-" + UUID.randomUUID() + "@staffsync.local";
	}

	private String tokenFor(String email) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");
	}

}
