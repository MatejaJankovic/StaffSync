package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
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
	private void allocate(User employee, int percent, LocalDate start, LocalDate end, AllocationStatus status) {
		User pm = userRepository.findByEmailIgnoreCase(PM).orElseThrow();
		Project project = projectRepository
			.save(new Project("Project-" + UUID.randomUUID(), "Acme", null, start, end, pm));
		StaffingRequest request = requestRepository
			.save(new StaffingRequest(project, "Developer", Seniority.MEDIOR, percent, start, end, 1));
		Allocation allocation = new Allocation(request, employee, percent, start, end, pm);
		allocation.setStatus(status);
		allocationRepository.save(allocation);
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
