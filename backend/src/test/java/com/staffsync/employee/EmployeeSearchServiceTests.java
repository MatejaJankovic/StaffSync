package com.staffsync.employee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.staffsync.allocation.CapacityService;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.employee.dto.EmployeeSearchResultDto;
import com.staffsync.employee.dto.SkillLevelDto;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillCategory;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link EmployeeSearchService} (US-23): the availability filter, the row data, sorting, paging and
 * validation. The skill, seniority and department filters run in the query and are tested in
 * {@code EmployeeSearchControllerTests}. "Today" is Wednesday 4 Nov 2026.
 */
@ExtendWith(MockitoExtension.class)
class EmployeeSearchServiceTests {

	static final LocalDate TODAY = LocalDate.of(2026, 11, 4);

	static final Pageable BY_LAST_NAME = PageRequest.of(0, 20, Sort.by("lastName"));

	static final EmployeeSearchFilters NO_FILTERS = new EmployeeSearchFilters(null, null, null, null, null, null,
			null);

	static final Skill JAVA = skill(1L, "Java");

	static final Skill SPRING = skill(2L, "Spring");

	static final Skill ANGULAR = skill(3L, "Angular");

	static final Skill DOCKER = skill(4L, "Docker");

	@Mock
	UserRepository userRepository;

	@Mock
	EmployeeSkillRepository employeeSkillRepository;

	@Mock
	SkillRepository skillRepository;

	@Mock
	DepartmentRepository departmentRepository;

	@Mock
	CapacityService capacityService;

	@InjectMocks
	EmployeeSearchService employeeSearchService;

	// ---- rows

	@Test
	void eachResultHasItsMainSkillsAndTodaysLoadAndFreeCapacity() {
		Department engineering = department(3L, "Engineering");
		User ana = employee(10L, "Ana", "Zoric", engineering);
		ana.setCapacityPercent(80);
		User marko = employee(11L, "Marko", "Babic", null);
		givenEmployees(List.of(ana, marko), rating(ana, JAVA, 3), rating(ana, DOCKER, 1), rating(ana, SPRING, 5),
				rating(ana, ANGULAR, 3));
		givenLoad(ana, 60);
		givenLoad(marko, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS, BY_LAST_NAME, TODAY);

		// The best three skills, highest level first, and equal levels by name: Angular before Java
		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::id, EmployeeSearchResultDto::skillLevel,
				EmployeeSearchResultDto::capacityPercent, EmployeeSearchResultDto::load, EmployeeSearchResultDto::free)
			.containsExactly(tuple(11L, null, 100, 0, 100), tuple(10L, null, 80, 60, 20));
		assertThat(page.getContent().get(0).topSkills()).isEmpty();
		assertThat(page.getContent().get(1).topSkills()).containsExactly(new SkillLevelDto(2L, "Spring", 5),
				new SkillLevelDto(3L, "Angular", 3), new SkillLevelDto(1L, "Java", 3));
		assertThat(page.getContent().get(1).department().name()).isEqualTo("Engineering");
	}

	@Test
	void withASkillEachResultHasThatSkillsLevel() {
		User ana = employee(10L, "Ana", "Zoric", null);
		when(skillRepository.existsById(JAVA.getId())).thenReturn(true);
		givenEmployees(List.of(ana), rating(ana, SPRING, 5), rating(ana, JAVA, 4));
		givenLoad(ana, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService
			.search(new EmployeeSearchFilters(JAVA.getId(), 4, null, null, null, null, null), BY_LAST_NAME, TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::skillLevel).containsExactly(4);
	}

	@Test
	void onAWeekendTheLoadIsTheNextMondays() {
		User ana = employee(10L, "Ana", "Zoric", null);
		givenEmployees(List.of(ana));
		when(capacityService.getDailyLoad(ana.getId(), nov(9), nov(9), null)).thenReturn(Map.of(nov(9), 30));

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS, BY_LAST_NAME, nov(7));

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::free).containsExactly(70);
	}

	// ---- availability

	@Test
	void anEmployeeMatchesOnlyWithEnoughFreeCapacityOnEveryWorkingDay() {
		User enough = employee(10L, "Enough", "A", null);
		User exactly = employee(11L, "Exactly", "B", null);
		User oneDayShort = employee(12L, "Short", "C", null);
		givenEmployees(List.of(enough, exactly, oneDayShort));
		givenFree(enough, 80, 60, 100);
		givenFree(exactly, 50, 50, 50);
		givenFree(oneDayShort, 100, 49, 100);
		givenLoad(enough, 0);
		givenLoad(exactly, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(availableFor(50), BY_LAST_NAME, TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::id).containsExactly(10L, 11L);
	}

	@Test
	void aPeriodWithoutWorkingDaysHasNothingToFail() {
		User ana = employee(10L, "Ana", "Zoric", null);
		givenEmployees(List.of(ana));
		when(capacityService.getFreeCapacity(ana.getId(), nov(7), nov(8))).thenReturn(Map.of());
		givenLoad(ana, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService
			.search(new EmployeeSearchFilters(null, null, null, null, nov(7), nov(8), 100), BY_LAST_NAME, TODAY);

		assertThat(page.getContent()).hasSize(1);
	}

	@Test
	void withoutAPeriodTheFreeCapacityIsNotChecked() {
		User ana = employee(10L, "Ana", "Zoric", null);
		givenEmployees(List.of(ana));
		givenLoad(ana, 100);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS, BY_LAST_NAME, TODAY);

		assertThat(page.getContent()).hasSize(1);
		verify(capacityService, never()).getFreeCapacity(any(), any(), any());
	}

	// ---- sort and page

	@Test
	void sortsByFreeCapacityThenByName() {
		User full = employee(10L, "Ana", "Zoric", null);
		User benchB = employee(11L, "Marko", "Babic", null);
		User benchA = employee(12L, "Ena", "Babic", null);
		givenEmployees(List.of(full, benchB, benchA));
		givenLoad(full, 100);
		givenLoad(benchB, 0);
		givenLoad(benchA, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS,
				PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "free")), TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::id).containsExactly(12L, 11L, 10L);
	}

	@Test
	void sortsByLevel() {
		User junior = employee(10L, "Ana", "Zoric", null);
		User expert = employee(11L, "Marko", "Babic", null);
		when(skillRepository.existsById(JAVA.getId())).thenReturn(true);
		givenEmployees(List.of(junior, expert), rating(junior, JAVA, 2), rating(expert, JAVA, 5));
		givenLoad(junior, 0);
		givenLoad(expert, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(
				new EmployeeSearchFilters(JAVA.getId(), null, null, null, null, null, null),
				PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "level")), TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::skillLevel).containsExactly(5, 2);
	}

	@Test
	void employeesWithoutADepartmentGoLastInBothDirections() {
		User none = employee(10L, "Ana", "Aaa", null);
		User qa = employee(11L, "Marko", "Bbb", department(1L, "QA"));
		User backend = employee(12L, "Ena", "Ccc", department(2L, "Backend"));
		givenEmployees(List.of(none, qa, backend));
		givenLoad(none, 0);
		givenLoad(qa, 0);
		givenLoad(backend, 0);

		assertThat(employeeSearchService.search(NO_FILTERS, PageRequest.of(0, 20, Sort.by("department")), TODAY)
			.getContent()).extracting(EmployeeSearchResultDto::id).containsExactly(12L, 11L, 10L);
		assertThat(employeeSearchService
			.search(NO_FILTERS, PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "department")), TODAY)
			.getContent()).extracting(EmployeeSearchResultDto::id).containsExactly(11L, 12L, 10L);
	}

	@Test
	void sortsBySeniorityFromJuniorToSenior() {
		User senior = employee(10L, "Ana", "Aaa", null);
		senior.setSeniority(Seniority.SENIOR);
		User junior = employee(11L, "Marko", "Bbb", null);
		junior.setSeniority(Seniority.JUNIOR);
		givenEmployees(List.of(senior, junior));
		givenLoad(senior, 0);
		givenLoad(junior, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS,
				PageRequest.of(0, 20, Sort.by("seniority")), TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::seniority)
			.containsExactly(Seniority.JUNIOR, Seniority.SENIOR);
	}

	@Test
	void returnsTheRequestedPageOfTheSortedResults() {
		List<User> employees = List.of(employee(10L, "A", "Eee", null), employee(11L, "B", "Ddd", null),
				employee(12L, "C", "Ccc", null), employee(13L, "D", "Bbb", null), employee(14L, "E", "Aaa", null));
		givenEmployees(employees);
		employees.forEach(employee -> givenLoad(employee, 0));

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS,
				PageRequest.of(1, 2, Sort.by("lastName")), TODAY);

		assertThat(page.getContent()).extracting(EmployeeSearchResultDto::lastName).containsExactly("Ccc", "Ddd");
		assertThat(page.getTotalElements()).isEqualTo(5);
		assertThat(page.getTotalPages()).isEqualTo(3);
	}

	@Test
	void aPageAfterTheLastIsEmpty() {
		User ana = employee(10L, "Ana", "Zoric", null);
		givenEmployees(List.of(ana));
		givenLoad(ana, 0);

		Page<EmployeeSearchResultDto> page = employeeSearchService.search(NO_FILTERS,
				PageRequest.of(3, 20, Sort.by("lastName")), TODAY);

		assertThat(page.getContent()).isEmpty();
		assertThat(page.getTotalElements()).isEqualTo(1);
	}

	@Test
	void noEmployeesNeedNoSkillQuery() {
		givenEmployees(List.of());

		assertThat(employeeSearchService.search(NO_FILTERS, BY_LAST_NAME, TODAY).getContent()).isEmpty();
		verifyNoInteractions(employeeSkillRepository);
	}

	// ---- validation

	@Test
	void anUnknownSortPropertyIs400() {
		assertThatThrownBy(
				() -> employeeSearchService.search(NO_FILTERS, PageRequest.of(0, 20, Sort.by("email")), TODAY))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", "INVALID_SORT")
			.hasMessage("Can't sort by 'email'. Sort by one of: department, firstName, free, id, lastName, level, "
					+ "seniority");
		verifyNoInteractions(userRepository);
	}

	@Test
	void aMinimumLevelNeedsASkill() {
		assertThatThrownBy(() -> employeeSearchService
			.search(new EmployeeSearchFilters(null, 3, null, null, null, null, null), BY_LAST_NAME, TODAY))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", "VALIDATION_ERROR");
		verifyNoInteractions(userRepository);
	}

	@Test
	void theAvailabilityFiltersGoTogether() {
		List<EmployeeSearchFilters> partial = List.of(
				new EmployeeSearchFilters(null, null, null, null, nov(2), null, null),
				new EmployeeSearchFilters(null, null, null, null, nov(2), nov(6), null),
				new EmployeeSearchFilters(null, null, null, null, null, null, 50),
				new EmployeeSearchFilters(null, null, null, null, null, nov(6), 50));

		for (EmployeeSearchFilters filters : partial) {
			assertThatThrownBy(() -> employeeSearchService.search(filters, BY_LAST_NAME, TODAY))
				.isInstanceOf(BusinessException.class)
				.hasFieldOrPropertyWithValue("code", EmployeeSearchService.INVALID_AVAILABILITY_FILTER);
		}
		verifyNoInteractions(userRepository);
	}

	@Test
	void theStartOfThePeriodMustNotBeAfterTheEnd() {
		assertThatThrownBy(() -> employeeSearchService
			.search(new EmployeeSearchFilters(null, null, null, null, nov(6), nov(2), 50), BY_LAST_NAME, TODAY))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", "INVALID_PERIOD")
			.hasMessage("From must not be after to");
	}

	@Test
	void thePeriodIsAtMostAYear() {
		assertThatThrownBy(() -> employeeSearchService.search(
				new EmployeeSearchFilters(null, null, null, null, nov(2), nov(2).plusYears(1).plusDays(1), 50),
				BY_LAST_NAME, TODAY))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", "INVALID_PERIOD")
			.hasMessage("The period must not be longer than a year");
	}

	@Test
	void anUnknownSkillIs404() {
		when(skillRepository.existsById(99L)).thenReturn(false);

		assertThatThrownBy(() -> employeeSearchService
			.search(new EmployeeSearchFilters(99L, null, null, null, null, null, null), BY_LAST_NAME, TODAY))
			.isInstanceOf(NotFoundException.class)
			.hasMessage("Skill 99 not found");
	}

	@Test
	void anUnknownDepartmentIs404() {
		when(departmentRepository.existsById(99L)).thenReturn(false);

		assertThatThrownBy(() -> employeeSearchService
			.search(new EmployeeSearchFilters(null, null, null, 99L, null, null, null), BY_LAST_NAME, TODAY))
			.isInstanceOf(NotFoundException.class)
			.hasMessage("Department 99 not found");
	}

	// ---- helpers

	/** The employees the query returns, and their skill ratings. */
	private void givenEmployees(List<User> employees, EmployeeSkill... ratings) {
		when(userRepository.findAll(ArgumentMatchers.<Specification<User>>any())).thenReturn(employees);
		if (!employees.isEmpty()) {
			when(employeeSkillRepository.findByUserIdIn(anyCollection())).thenReturn(List.of(ratings));
		}
	}

	/** The employee's load on today, Wednesday 4 Nov. */
	private void givenLoad(User employee, int load) {
		when(capacityService.getDailyLoad(employee.getId(), TODAY, TODAY, null)).thenReturn(Map.of(TODAY, load));
	}

	/** Free capacity on Mon 2, Tue 3 and Wed 4 Nov, the period of {@link #availableFor}. */
	private void givenFree(User employee, int mon, int tue, int wed) {
		Map<LocalDate, Integer> free = new TreeMap<>(Map.of(nov(2), mon, nov(3), tue, nov(4), wed));
		when(capacityService.getFreeCapacity(employee.getId(), nov(2), nov(4))).thenReturn(free);
	}

	private static EmployeeSearchFilters availableFor(int minFreePercent) {
		return new EmployeeSearchFilters(null, null, null, null, nov(2), nov(4), minFreePercent);
	}

	private static User employee(Long id, String firstName, String lastName, Department department) {
		User user = new User(firstName.toLowerCase() + id + "@staffsync.local", "hash", firstName, lastName,
				Role.EMPLOYEE);
		ReflectionTestUtils.setField(user, "id", id);
		user.setSeniority(Seniority.MEDIOR);
		user.setDepartment(department);
		return user;
	}

	private static Department department(Long id, String name) {
		Department department = new Department(name);
		ReflectionTestUtils.setField(department, "id", id);
		return department;
	}

	private static Skill skill(Long id, String name) {
		Skill skill = new Skill(name, SkillCategory.BACKEND);
		ReflectionTestUtils.setField(skill, "id", id);
		return skill;
	}

	private static EmployeeSkill rating(User user, Skill skill, int level) {
		return new EmployeeSkill(user, skill, level, 1);
	}

	private static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

}
