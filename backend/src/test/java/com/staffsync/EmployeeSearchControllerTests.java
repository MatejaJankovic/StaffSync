package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillCategory;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code GET /api/employees/search} (US-23). Every test makes its own department and skills and searches inside
 * that department, so employees from other tests never show up.
 */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EmployeeSearchControllerTests {

	private static final String URL = "/api/employees/search";

	private static final String PASSWORD = "Password123!";

	private static final String PM = "mateja_pm@staffsync.local";

	private static final String RM = "lazar_rm@staffsync.local";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	private static final String EMPLOYEE = "bogdan_employee@staffsync.local";

	/** Mon 2 – Fri 6 Nov 2026, the period of the availability tests. */
	private static final LocalDate MON = LocalDate.of(2026, 11, 2);

	private static final LocalDate FRI = LocalDate.of(2026, 11, 6);

	@LocalServerPort
	int port;

	@Autowired
	UserRepository userRepository;

	@Autowired
	DepartmentRepository departmentRepository;

	@Autowired
	SkillRepository skillRepository;

	@Autowired
	EmployeeSkillRepository employeeSkillRepository;

	@Autowired
	ProjectRepository projectRepository;

	@Autowired
	StaffingRequestRepository requestRepository;

	@Autowired
	AllocationRepository allocationRepository;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	// ---- filters

	@Test
	void theDepartmentFilterKeepsOnlyItsActiveEmployees() {
		Department department = newDepartment();
		User ana = newEmployee("Ana", "Avramovic", department, Seniority.JUNIOR);
		User boris = newEmployee("Boris", "Bozic", department, Seniority.SENIOR);
		User former = newEmployee("Former", "Cvetic", department, Seniority.MEDIOR);
		former.setActive(false);
		userRepository.save(former);
		User pm = newEmployee("Pm", "Dimic", department, null);
		pm.setRole(Role.PM);
		userRepository.save(pm);
		newEmployee("Other", "Aaa", newDepartment(), Seniority.MEDIOR);

		search(PM).queryParam("departmentId", department.getId())
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(ana), id(boris)))
			.body("content[0].department.name", equalTo(department.getName()))
			.body("page.totalElements", equalTo(2));
	}

	@Test
	void theSkillFilterKeepsEmployeesWithTheSkillAtTheMinimumLevel() {
		Department department = newDepartment();
		Skill java = newSkill("Java");
		User expert = newEmployee("Expert", "Avramovic", department, Seniority.SENIOR);
		rate(expert, java, 4);
		User beginner = newEmployee("Beginner", "Bozic", department, Seniority.JUNIOR);
		rate(beginner, java, 2);
		newEmployee("Without", "Cvetic", department, Seniority.MEDIOR);

		// Without a minimum level, any level counts
		search(RM).queryParam("departmentId", department.getId()).queryParam("skillId", java.getId())
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(expert), id(beginner)))
			.body("content.skillLevel", contains(4, 2));
		search(RM).queryParam("departmentId", department.getId())
			.queryParam("skillId", java.getId())
			.queryParam("minLevel", 4)
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(expert)));
	}

	@Test
	void theSeniorityFilterKeepsThatSeniority() {
		Department department = newDepartment();
		newEmployee("Junior", "Avramovic", department, Seniority.JUNIOR);
		User senior = newEmployee("Senior", "Bozic", department, Seniority.SENIOR);

		search(PM).queryParam("departmentId", department.getId())
			.queryParam("seniority", "SENIOR")
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(senior)));
	}

	@Test
	void theAvailabilityFilterNeedsEnoughFreeCapacityOnEveryWorkingDay() {
		Department department = newDepartment();
		User busy = newEmployee("Busy", "Avramovic", department, Seniority.MEDIOR);
		allocate(busy, 60, MON, FRI, AllocationStatus.APPROVED);
		User busyOneDay = newEmployee("OneDay", "Bozic", department, Seniority.MEDIOR);
		allocate(busyOneDay, 60, MON.plusDays(2), MON.plusDays(2), AllocationStatus.CHANGE_PENDING);
		User proposed = newEmployee("Proposed", "Cvetic", department, Seniority.MEDIOR);
		// A proposal is not a booking yet, so it doesn't take free capacity
		allocate(proposed, 60, MON, FRI, AllocationStatus.PROPOSED);
		User partTime = newEmployee("PartTime", "Dimic", department, Seniority.MEDIOR);
		partTime.setCapacityPercent(50);
		userRepository.save(partTime);

		search(PM).queryParam("departmentId", department.getId())
			.queryParam("availableFrom", MON.toString())
			.queryParam("availableTo", FRI.toString())
			.queryParam("minFreePercent", 50)
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(proposed), id(partTime)));
		// Exactly the free capacity is enough
		search(PM).queryParam("departmentId", department.getId())
			.queryParam("availableFrom", MON.toString())
			.queryParam("availableTo", FRI.toString())
			.queryParam("minFreePercent", 40)
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(busy), id(busyOneDay), id(proposed), id(partTime)));
	}

	@Test
	void theFiltersCombineWithAnd() {
		Department department = newDepartment();
		Skill java = newSkill("Java");
		User match = newEmployee("Match", "Avramovic", department, Seniority.SENIOR);
		rate(match, java, 5);
		User tooBusy = newEmployee("Busy", "Bozic", department, Seniority.SENIOR);
		rate(tooBusy, java, 5);
		allocate(tooBusy, 80, MON, FRI, AllocationStatus.APPROVED);
		User tooJunior = newEmployee("Junior", "Cvetic", department, Seniority.JUNIOR);
		rate(tooJunior, java, 5);
		User tooWeak = newEmployee("Weak", "Dimic", department, Seniority.SENIOR);
		rate(tooWeak, java, 2);
		User elsewhere = newEmployee("Elsewhere", "Eric", newDepartment(), Seniority.SENIOR);
		rate(elsewhere, java, 5);

		search(RM).queryParam("skillId", java.getId())
			.queryParam("minLevel", 4)
			.queryParam("seniority", "SENIOR")
			.queryParam("departmentId", department.getId())
			.queryParam("availableFrom", MON.toString())
			.queryParam("availableTo", FRI.toString())
			.queryParam("minFreePercent", 50)
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(match)));
	}

	// ---- results

	@Test
	void eachResultHasItsMainSkillsAndTodaysLoadAndFreeCapacity() {
		Department department = newDepartment();
		Skill java = newSkill("Java");
		Skill spring = newSkill("Spring");
		Skill angular = newSkill("Angular");
		Skill docker = newSkill("Docker");
		User ana = newEmployee("Ana", "Avramovic", department, Seniority.SENIOR);
		ana.setCapacityPercent(80);
		userRepository.save(ana);
		rate(ana, java, 4);
		rate(ana, spring, 5);
		rate(ana, angular, 2);
		rate(ana, docker, 1);
		LocalDate day = CapacityService.workingDayFrom(LocalDate.now());
		allocate(ana, 30, day.minusDays(30), day.plusDays(30), AllocationStatus.APPROVED);

		search(PM).queryParam("departmentId", department.getId())
			.queryParam("skillId", java.getId())
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content[0].firstName", equalTo("Ana"))
			.body("content[0].seniority", equalTo("SENIOR"))
			.body("content[0].skillLevel", equalTo(4))
			.body("content[0].topSkills.name", contains(spring.getName(), java.getName(), angular.getName()))
			.body("content[0].topSkills.level", contains(5, 4, 2))
			.body("content[0].capacityPercent", equalTo(80))
			.body("content[0].load", equalTo(30))
			.body("content[0].free", equalTo(50))
			.body("content[0]", not(hasKey("email")));
	}

	@Test
	void withoutASkillTheLevelIsNull() {
		Department department = newDepartment();
		newEmployee("Ana", "Avramovic", department, Seniority.SENIOR);

		search(PM).queryParam("departmentId", department.getId())
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content[0].skillLevel", nullValue())
			.body("content[0].topSkills.size()", equalTo(0));
	}

	// ---- sort and page

	@Test
	void sortsByLevelAndFreeCapacity() {
		Department department = newDepartment();
		Skill java = newSkill("Java");
		User medium = newEmployee("Medium", "Avramovic", department, Seniority.MEDIOR);
		rate(medium, java, 3);
		User strong = newEmployee("Strong", "Bozic", department, Seniority.MEDIOR);
		rate(strong, java, 5);
		User weak = newEmployee("Weak", "Cvetic", department, Seniority.MEDIOR);
		rate(weak, java, 1);
		LocalDate day = CapacityService.workingDayFrom(LocalDate.now());
		allocate(strong, 70, day.minusDays(10), day.plusDays(10), AllocationStatus.APPROVED);
		allocate(weak, 20, day.minusDays(10), day.plusDays(10), AllocationStatus.APPROVED);

		search(PM).queryParam("departmentId", department.getId())
			.queryParam("skillId", java.getId())
			.queryParam("sort", "level,desc")
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.skillLevel", contains(5, 3, 1));
		search(PM).queryParam("departmentId", department.getId())
			.queryParam("sort", "free,desc")
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.free", contains(100, 80, 30));
	}

	@Test
	void resultsArePaged() {
		Department department = newDepartment();
		newEmployee("A", "Avramovic", department, Seniority.MEDIOR);
		newEmployee("B", "Bozic", department, Seniority.MEDIOR);
		User third = newEmployee("C", "Cvetic", department, Seniority.MEDIOR);

		search(PM).queryParam("departmentId", department.getId())
			.queryParam("page", 1)
			.queryParam("size", 2)
			.when().get(URL)
			.then()
			.statusCode(200)
			.body("content.id", contains(id(third)))
			.body("page.number", equalTo(1))
			.body("page.size", equalTo(2))
			.body("page.totalElements", equalTo(3))
			.body("page.totalPages", equalTo(2));
	}

	// ---- validation

	@Test
	void onlySomeOfTheAvailabilityFiltersIs400() {
		search(PM).queryParam("availableFrom", MON.toString())
			.queryParam("availableTo", FRI.toString())
			.when().get(URL)
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_AVAILABILITY_FILTER"));
	}

	@Test
	void aPeriodThatEndsBeforeItStartsIs400() {
		search(PM).queryParam("availableFrom", FRI.toString())
			.queryParam("availableTo", MON.toString())
			.queryParam("minFreePercent", 50)
			.when().get(URL)
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_PERIOD"));
	}

	@Test
	void aMinimumLevelWithoutASkillIs400() {
		search(PM).queryParam("minLevel", 3)
			.when().get(URL)
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", contains("minLevel"));
	}

	@Test
	void outOfRangeLevelsAndPercentsAre400() {
		Skill java = newSkill("Java");

		search(PM).queryParam("skillId", java.getId())
			.queryParam("minLevel", 6)
			.queryParam("availableFrom", MON.toString())
			.queryParam("availableTo", FRI.toString())
			.queryParam("minFreePercent", 101)
			.when().get(URL)
			.then()
			.statusCode(400)
			.body("code", equalTo("VALIDATION_ERROR"))
			.body("details.field", containsInAnyOrder("minLevel", "minFreePercent"))
			.body("details.message", hasItems("Minimum level must be between 1 and 5",
					"Minimum free % must be between 0 and 100"));
	}

	@Test
	void anUnknownSortPropertyIs400() {
		search(PM).queryParam("sort", "email")
			.when().get(URL)
			.then()
			.statusCode(400)
			.body("code", equalTo("INVALID_SORT"));
	}

	@Test
	void anUnknownSeniorityIs400() {
		search(PM).queryParam("seniority", "GURU").when().get(URL).then().statusCode(400);
	}

	@Test
	void anUnknownSkillIs404() {
		search(PM).queryParam("skillId", Long.MAX_VALUE)
			.when().get(URL)
			.then()
			.statusCode(404)
			.body("code", equalTo("NOT_FOUND"));
	}

	// ---- access

	@ParameterizedTest
	@ValueSource(strings = { ADMIN, EMPLOYEE })
	void onlyAPmOrAnRmCanSearch(String email) {
		search(email).when().get(URL).then().statusCode(403);
		// Even with a malformed filter, the role is checked first
		search(email).queryParam("seniority", "GURU").when().get(URL).then().statusCode(403);
	}

	@Test
	void searchingWithoutTokenIs401() {
		given().when().get(URL).then().statusCode(401);
	}

	@Test
	void swaggerDocumentsTheFiltersAndTheResult() {
		given().when().get("/v3/api-docs")
			.then()
			.statusCode(200)
			.body("paths.'/api/employees/search'.get.parameters.name",
					hasItems("skillId", "minLevel", "seniority", "departmentId", "availableFrom", "availableTo",
							"minFreePercent", "page", "size", "sort"))
			.body("paths.'/api/employees/search'.get.responses", hasKey("403"))
			.body("components.schemas.EmployeeSearchResultDto.properties", hasKey("topSkills"));
	}

	// ---- helpers

	private RequestSpecification search(String email) {
		return given().auth().oauth2(tokenFor(email));
	}

	private Department newDepartment() {
		return departmentRepository.save(new Department("Dept-" + UUID.randomUUID().toString().substring(0, 8)));
	}

	/** A skill only this test uses. */
	private Skill newSkill(String name) {
		return skillRepository
			.save(new Skill(name + "-" + UUID.randomUUID().toString().substring(0, 8), SkillCategory.BACKEND));
	}

	/**
	 * The last name gets a "Search-" prefix, so these users sort after the seed users on other tests' first page of
	 * {@code /api/users}, and keep their order among themselves.
	 */
	private User newEmployee(String firstName, String lastName, Department department, Seniority seniority) {
		// Nobody logs in as these users, so the hash does not have to be a real one
		User employee = new User("search-" + UUID.randomUUID() + "@staffsync.local", "not-a-real-hash", firstName,
				"Search-" + lastName, Role.EMPLOYEE);
		employee.setDepartment(department);
		employee.setSeniority(seniority);
		return userRepository.save(employee);
	}

	private void rate(User employee, Skill skill, int level) {
		employeeSkillRepository.save(new EmployeeSkill(employee, skill, level, 1));
	}

	/** Allocation transitions belong to other stories, so tests save the allocation with its status. */
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

	private static int id(User user) {
		return user.getId().intValue();
	}

	private String tokenFor(String email) {
		return given().contentType(ContentType.JSON)
			.body(Map.of("email", email, "password", PASSWORD))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");
	}

}
