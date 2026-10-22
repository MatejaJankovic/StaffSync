package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
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
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code GET /api/requests/{id}/candidates} (US-09) against the real {@code CapacityService} and PostgreSQL.
 * The scoring cases are in {@code MatchingServiceTests}, so these cover the filter queries, access (BR-4),
 * paging and the Swagger docs. Every test makes its own skills, so employees that other tests leave in the
 * shared database never match.
 */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MatchingControllerTests {

	private static final String PASSWORD = "Password123!";

	private static final String PM = "mateja_pm@staffsync.local";

	private static final String RM = "lazar_rm@staffsync.local";

	private static final String EMPLOYEE = "bogdan_employee@staffsync.local";

	private static final String ADMIN = "vukasin_admin@staffsync.local";

	private static final String CANDIDATES = "/api/requests/{id}/candidates";

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
	StaffingRequestRepository requestRepository;

	@Autowired
	AllocationRepository allocationRepository;

	@Autowired
	PasswordEncoder passwordEncoder;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
	}

	// ---- the §4 demo

	@Test
	void ranksMarkoAbove85JelenaAt67ForTheDemoRequest() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project, skills);
		int otherRequest = createRequest(pm.token(), project, skills);

		Department engineering = departmentRepository.save(new Department("Engineering-" + UUID.randomUUID()));
		User marko = newEmployee("Marko", Seniority.SENIOR, 100);
		rate(marko, skills.java(), 5);
		rate(marko, skills.spring(), 4);
		rate(marko, skills.postgres(), 3);
		User jelena = newEmployee("Jelena", Seniority.MEDIOR, 100);
		jelena.setDepartment(engineering);
		userRepository.save(jelena);
		rate(jelena, skills.java(), 4);
		rate(jelena, skills.spring(), 3);
		// Jelena is busy at 60% on another request until 14.11, so she has 40% free until then
		allocate(otherRequest, jelena, 60, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 14),
				AllocationStatus.APPROVED, pm.id());

		given().auth().oauth2(pm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content", hasSize(2))
			.body("content[0].employeeId", equalTo((int) (long) marko.getId()))
			.body("content[0].fullName", equalTo(marko.getFirstName() + " " + marko.getLastName()))
			.body("content[0].seniority", equalTo("SENIOR"))
			.body("content[0].score", equalTo(85))
			.body("content[0].breakdown.skills", equalTo(40))
			.body("content[0].breakdown.availability", equalTo(40))
			.body("content[0].breakdown.seniority", equalTo(5))
			.body("content[0].reasons[0]", equalTo("%s 5/5 (required ≥ 4)".formatted(skills.javaName())))
			.body("content[0].warnings", equalTo(List.of("Seniority SENIOR (MEDIOR requested)")))
			.body("content[1].employeeId", equalTo((int) (long) jelena.getId()))
			.body("content[1].department", equalTo(engineering.getName()))
			.body("content[1].score", equalTo(67))
			.body("content[1].breakdown.skills", equalTo(23))
			.body("content[1].breakdown.availability", equalTo(34))
			.body("content[1].breakdown.seniority", equalTo(10))
			.body("content[1].reasons", equalTo(List.of("%s 4/5 (required ≥ 4)".formatted(skills.javaName()),
					"%s 3/5 (required ≥ 3)".formatted(skills.springName()))))
			.body("content[1].warnings",
					equalTo(List.of("Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)",
							"Missing %s (nice to have)".formatted(skills.postgresName()))))
			.body("page.totalElements", equalTo(2));
	}

	// ---- the filter

	@Test
	void whoHasAProposedApprovedOrChangePendingAllocationOnTheRequestIsNotListed() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int project = createProject(pm.token());
		int request = createRequest(pm.token(), project, skills);
		LocalDate start = LocalDate.of(2026, 11, 2);
		LocalDate end = LocalDate.of(2026, 11, 6);

		User proposed = capableEmployee("Proposed", skills);
		User approved = capableEmployee("Approved", skills);
		User changePending = capableEmployee("ChangePending", skills);
		User rejected = capableEmployee("Rejected", skills);
		User cancelled = capableEmployee("Cancelled", skills);
		User untouched = capableEmployee("Untouched", skills);
		allocate(request, proposed, 60, start, end, AllocationStatus.PROPOSED, pm.id());
		allocate(request, approved, 60, start, end, AllocationStatus.APPROVED, pm.id());
		Allocation pending = allocate(request, changePending, 60, start, end, AllocationStatus.APPROVED, pm.id());
		pending.requestChange(80, start, end, "The client wants more");
		allocationRepository.save(pending);
		allocate(request, rejected, 60, start, end, AllocationStatus.REJECTED, pm.id());
		allocate(request, cancelled, 60, start, end, AllocationStatus.CANCELLED, pm.id());

		// A rejected or cancelled proposal is over, so the employee can be proposed again
		given().auth().oauth2(pm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content.employeeId", containsInAnyOrder(id(rejected), id(cancelled),
					id(untouched)))
			.body("page.totalElements", equalTo(3));
	}

	// T-24
	@Test
	void anEmployeeWithoutAMandatorySkillOrBelowItsLevelIsNotListed() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);
		User capable = capableEmployee("Capable", skills);
		User noSpring = newEmployee("NoSpring", Seniority.MEDIOR, 100);
		rate(noSpring, skills.java(), 5);
		User tooLow = newEmployee("TooLow", Seniority.MEDIOR, 100);
		rate(tooLow, skills.java(), 3);
		rate(tooLow, skills.spring(), 5);

		given().auth().oauth2(pm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content", hasSize(1))
			.body("content[0].employeeId", equalTo(id(capable)));
	}

	@Test
	void inactiveEmployeesAndUsersOfOtherRolesAreNotListed() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);
		User active = capableEmployee("Active", skills);
		User inactive = capableEmployee("Inactive", skills);
		inactive.setActive(false);
		userRepository.save(inactive);
		for (Role role : List.of(Role.PM, Role.RM, Role.ADMIN)) {
			User other = newUser("Other" + role, role, Seniority.MEDIOR, 100);
			rate(other, skills.java(), 5);
			rate(other, skills.spring(), 5);
		}

		given().auth().oauth2(pm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content", hasSize(1))
			.body("content[0].employeeId", equalTo(id(active)));
	}

	@Test
	void aPartTimeEmployeeWhoCannotCoverThePercentIsStillListedWithAWarning() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);
		User partTime = newEmployee("PartTime", Seniority.MEDIOR, 50);
		rate(partTime, skills.java(), 4);
		rate(partTime, skills.spring(), 3);

		given().auth().oauth2(pm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content", hasSize(1))
			.body("content[0].breakdown.availability", equalTo(0))
			.body("content[0].warnings[0]",
					equalTo("Insufficient capacity 2026-11-02 – 2027-01-29 (50% free, 60% required)"));
	}

	// ---- paging

	@Test
	void supportsPageAndSizeAndKeepsTheScoreOrderAcrossPages() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);
		User best = newEmployee("Best", Seniority.MEDIOR, 100);
		rate(best, skills.java(), 5);
		rate(best, skills.spring(), 5);
		rate(best, skills.postgres(), 5);
		User middle = newEmployee("Middle", Seniority.MEDIOR, 100);
		rate(middle, skills.java(), 4);
		rate(middle, skills.spring(), 4);
		User last = capableEmployee("Last", skills);

		given().auth().oauth2(pm.token()).queryParam("page", 0).queryParam("size", 2)
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content.employeeId", equalTo(List.of(id(best), id(middle))))
			.body("page.size", equalTo(2))
			.body("page.number", equalTo(0))
			.body("page.totalElements", equalTo(3))
			.body("page.totalPages", equalTo(2));
		given().auth().oauth2(pm.token()).queryParam("page", 1).queryParam("size", 2)
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content.employeeId", equalTo(List.of(id(last))))
			.body("page.number", equalTo(1));
	}

	@Test
	void aSortParameterDoesNotChangeTheScoreOrder() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);
		User strong = newEmployee("Aaa", Seniority.MEDIOR, 100);
		rate(strong, skills.java(), 5);
		rate(strong, skills.spring(), 5);
		User weak = capableEmployee("Zzz", skills);

		given().auth().oauth2(pm.token()).queryParam("sort", "fullName,desc")
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(200)
			.body("content.employeeId", equalTo(List.of(id(strong), id(weak))));
	}

	// ---- access (BR-4)

	@Test
	void anotherPmGets403() {
		Skills skills = newSkills();
		LoggedIn owner = login(PM);
		int request = createRequest(owner.token(), createProject(owner.token()), skills);
		LoggedIn otherPm = newPm();

		given().auth().oauth2(otherPm.token())
			.when().get(CANDIDATES, request)
			.then()
			.statusCode(403)
			.body("code", equalTo("NOT_PROJECT_OWNER"));
	}

	@Test
	void otherRolesGet403() {
		Skills skills = newSkills();
		LoggedIn pm = login(PM);
		int request = createRequest(pm.token(), createProject(pm.token()), skills);

		for (String email : List.of(RM, EMPLOYEE, ADMIN)) {
			given().auth().oauth2(login(email).token())
				.when().get(CANDIDATES, request)
				.then()
				.statusCode(403)
				.body("code", equalTo("FORBIDDEN"));
		}
	}

	@Test
	void withoutATokenItIs401() {
		given()
			.when().get(CANDIDATES, 1)
			.then()
			.statusCode(401);
	}

	@Test
	void anUnknownRequestIs404() {
		given().auth().oauth2(login(PM).token())
			.when().get(CANDIDATES, 999_999_999)
			.then()
			.statusCode(404)
			.body("code", equalTo("NOT_FOUND"));
	}

	// ---- Swagger

	@Test
	void swaggerDescribesTheEndpointItsErrorsAndTheJelenaExample() {
		given()
			.when().get("/v3/api-docs")
			.then()
			.statusCode(200)
			.body("paths.'/api/requests/{id}/candidates'.get.tags[0]", equalTo("Matching"))
			.body("paths.'/api/requests/{id}/candidates'.get.summary", notNullValue())
			.body("paths.'/api/requests/{id}/candidates'.get.description", containsString("sum of the rounded"))
			.body("paths.'/api/requests/{id}/candidates'.get.security[0]", hasKey("bearerAuth"))
			.body("paths.'/api/requests/{id}/candidates'.get.responses", hasKey("200"))
			.body("paths.'/api/requests/{id}/candidates'.get.responses", hasKey("401"))
			.body("paths.'/api/requests/{id}/candidates'.get.responses", hasKey("403"))
			.body("paths.'/api/requests/{id}/candidates'.get.responses", hasKey("404"))
			.body("paths.'/api/requests/{id}/candidates'.get.responses.'200'.content.values()[0].schema.'$ref'",
					endsWith("/PagedModelCandidateDto"))
			.body("components.schemas.PagedModelCandidateDto.properties.content.items.'$ref'",
					endsWith("/CandidateDto"))
			.body("components.schemas.CandidateDto.properties", hasKey("breakdown"))
			.body("components.schemas.CandidateDto.properties", hasKey("warnings"))
			.body("components.schemas.CandidateDto.example.fullName", equalTo("Jelena Petrović"))
			.body("components.schemas.CandidateDto.example.score", equalTo(67))
			.body("components.schemas.CandidateDto.example.breakdown.skills", equalTo(23))
			.body("components.schemas.CandidateDto.example.warnings", hasSize(2));
	}

	// ---- helpers

	/** Skills only this test uses, so employees from other tests never match. */
	private Skills newSkills() {
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		return new Skills(skillRepository.save(new Skill("Java-" + suffix, SkillCategory.BACKEND)),
				skillRepository.save(new Skill("Spring-" + suffix, SkillCategory.BACKEND)),
				skillRepository.save(new Skill("PostgreSQL-" + suffix, SkillCategory.DATABASE)));
	}

	/** Has the two mandatory skills at exactly their minimum level and no nice-to-have one. */
	private User capableEmployee(String firstName, Skills skills) {
		User employee = newEmployee(firstName, Seniority.MEDIOR, 100);
		rate(employee, skills.java(), 4);
		rate(employee, skills.spring(), 3);
		return employee;
	}

	private User newEmployee(String firstName, Seniority seniority, int capacityPercent) {
		return newUser(firstName, Role.EMPLOYEE, seniority, capacityPercent);
	}

	private User newUser(String firstName, Role role, Seniority seniority, int capacityPercent) {
		String unique = UUID.randomUUID().toString().substring(0, 8);
		// Nobody logs in as these users, so the hash does not have to be a real one
		User user = new User(firstName.toLowerCase() + "-" + unique + "@staffsync.local", "not-a-real-hash",
				firstName, "Matching-" + unique, role);
		user.setSeniority(seniority);
		user.setCapacityPercent(capacityPercent);
		return userRepository.save(user);
	}

	private void rate(User user, Skill skill, int level) {
		employeeSkillRepository.save(new EmployeeSkill(user, skill, level, 1));
	}

	private Allocation allocate(int requestId, User employee, int percent, LocalDate start, LocalDate end,
			AllocationStatus status, int pmId) {
		StaffingRequest request = requestRepository.findById((long) requestId).orElseThrow();
		User pm = userRepository.findById((long) pmId).orElseThrow();
		Allocation allocation = new Allocation(request, employee, percent, start, end, pm);
		allocation.setStatus(status);
		return allocationRepository.save(allocation);
	}

	private static int id(User user) {
		return (int) (long) user.getId();
	}

	private int createProject(String token) {
		return given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "Project-" + UUID.randomUUID(), "client", "Acme", "startDate", "2026-11-01",
					"endDate", "2027-03-31"))
			.when().post("/api/projects")
			.then().statusCode(201).extract().path("id");
	}

	/** §4: MEDIOR, 60%, 1.11–31.1, Java ≥ 4 and Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have. */
	private int createRequest(String token, int project, Skills skills) {
		Map<String, Object> body = new HashMap<>();
		body.put("title", "Java Developer");
		body.put("seniority", "MEDIOR");
		body.put("allocationPercent", 60);
		body.put("startDate", "2026-11-01");
		body.put("endDate", "2027-01-31");
		body.put("headcount", 2);
		body.put("skills", new ArrayList<>(List.of(requestSkill(skills.java(), 4, true),
				requestSkill(skills.spring(), 3, true), requestSkill(skills.postgres(), 2, false))));
		return given().auth().oauth2(token).contentType(ContentType.JSON).body(body)
			.when().post("/api/projects/" + project + "/requests")
			.then().statusCode(201).extract().path("id");
	}

	private Map<String, Object> requestSkill(Skill skill, int minLevel, boolean mandatory) {
		Map<String, Object> requestSkill = new HashMap<>();
		requestSkill.put("skillId", skill.getId());
		requestSkill.put("minLevel", minLevel);
		requestSkill.put("mandatory", mandatory);
		return requestSkill;
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

	private record Skills(Skill java, Skill spring, Skill postgres) {

		String javaName() {
			return java.getName();
		}

		String springName() {
			return spring.getName();
		}

		String postgresName() {
			return postgres.getName();
		}

	}

}
