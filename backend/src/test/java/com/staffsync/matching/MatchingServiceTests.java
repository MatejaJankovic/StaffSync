package com.staffsync.matching;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.Function;

import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.Department;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.matching.dto.CandidateDto;
import com.staffsync.project.Project;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillCategory;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link MatchingService} (§8) with a mocked {@link CapacityService}. The §8 example, T-24
 * and T-25 come first, and the rest cover the mechanics around them. November 2026 starts on a Sunday, so
 * the 2nd is a Monday.
 */
@ExtendWith(MockitoExtension.class)
class MatchingServiceTests {

	static final Long REQUEST_ID = 10L;

	static final Long PM_ID = 5L;

	static final LocalDate DEMO_START = LocalDate.of(2026, 11, 1);

	static final LocalDate DEMO_END = LocalDate.of(2027, 1, 31);

	static final Skill JAVA = skill(1L, "Java", SkillCategory.BACKEND);

	static final Skill SPRING = skill(2L, "Spring", SkillCategory.BACKEND);

	static final Skill POSTGRESQL = skill(3L, "PostgreSQL", SkillCategory.DATABASE);

	@Mock
	StaffingRequestRepository requestRepository;

	@Mock
	UserRepository userRepository;

	@Mock
	EmployeeSkillRepository employeeSkillRepository;

	@Mock
	AllocationRepository allocationRepository;

	@Mock
	CapacityService capacityService;

	@InjectMocks
	MatchingService matchingService;

	// ---- §8 example

	@Test
	void reproducesTheSpecExampleMarko85AndJelena67() {
		StaffingRequest request = demoRequest();
		User marko = employee(16L, "Marko", "Jovanović", Seniority.SENIOR);
		User jelena = employee(17L, "Jelena", "Petrović", Seniority.MEDIOR);
		// Jelena is listed first on purpose: the order of the result must come from the score
		givenCandidates(List.of(jelena, marko), rating(jelena, JAVA, 4), rating(jelena, SPRING, 3),
				rating(marko, JAVA, 5), rating(marko, SPRING, 4), rating(marko, POSTGRESQL, 3));
		givenFreeCapacity(request, marko, day -> 100);
		// Jelena has 40% free until 14.11 and everything free from 15.11
		givenFreeCapacity(request, jelena, day -> day.isBefore(LocalDate.of(2026, 11, 15)) ? 40 : 100);

		List<CandidateDto> ranked = matchingService.rank(request);

		assertThat(ranked).extracting(CandidateDto::fullName).containsExactly("Marko Jovanović", "Jelena Petrović");
		CandidateDto first = ranked.get(0);
		assertThat(first.employeeId()).isEqualTo(16L);
		assertThat(first.score()).isEqualTo(85);
		assertThat(first.breakdown()).isEqualTo(new CandidateDto.Breakdown(40, 40, 5));
		assertThat(first.reasons()).containsExactly("Java 5/5 (required ≥ 4)", "Spring 4/5 (required ≥ 3)",
				"PostgreSQL 3/5 (nice to have ≥ 2)");
		assertThat(first.warnings()).containsExactly("Seniority SENIOR (MEDIOR requested)");

		CandidateDto second = ranked.get(1);
		assertThat(second.employeeId()).isEqualTo(17L);
		assertThat(second.score()).isEqualTo(67);
		assertThat(second.breakdown()).isEqualTo(new CandidateDto.Breakdown(23, 34, 10));
		assertThat(second.reasons()).containsExactly("Java 4/5 (required ≥ 4)", "Spring 3/5 (required ≥ 3)");
		assertThat(second.warnings()).containsExactly(
				"Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)",
				"Missing PostgreSQL (nice to have)");
	}

	// T-24
	@Test
	void aCandidateWithoutAMandatorySkillIsNotInTheList() {
		StaffingRequest request = demoRequest();
		User complete = employee(1L, "Complete", "Candidate", Seniority.MEDIOR);
		User noSpring = employee(2L, "No", "Spring", Seniority.MEDIOR);
		givenCandidates(List.of(noSpring, complete), rating(complete, JAVA, 4), rating(complete, SPRING, 3),
				rating(noSpring, JAVA, 5), rating(noSpring, POSTGRESQL, 5));
		givenFreeCapacity(request, complete, day -> 100);

		List<CandidateDto> ranked = matchingService.rank(request);

		assertThat(ranked).extracting(CandidateDto::employeeId).containsExactly(1L);
		verify(capacityService, never()).getFreeCapacity(eq(2L), any(), any());
	}

	@Test
	void aMandatorySkillBelowItsMinimumLevelMeansNotInTheList() {
		StaffingRequest request = demoRequest();
		User tooLow = employee(1L, "Too", "Low", Seniority.MEDIOR);
		givenCandidates(List.of(tooLow), rating(tooLow, JAVA, 3), rating(tooLow, SPRING, 5));

		assertThat(matchingService.rank(request)).isEmpty();
	}

	@Test
	void anEmployeeWithNoSkillsAtAllIsNotInTheList() {
		StaffingRequest request = demoRequest();
		givenCandidates(List.of(employee(1L, "No", "Skills", Seniority.MEDIOR)));

		assertThat(matchingService.rank(request)).isEmpty();
	}

	// T-25
	@Test
	void theMoreAvailableOfTwoOtherwiseEqualCandidatesRanksHigher() {
		StaffingRequest request = demoRequest();
		User busy = employee(1L, "Busy", "Bee", Seniority.MEDIOR);
		User free = employee(2L, "Free", "Bird", Seniority.MEDIOR);
		givenCandidates(List.of(busy, free), rating(busy, JAVA, 4), rating(busy, SPRING, 3), rating(free, JAVA, 4),
				rating(free, SPRING, 3));
		// Busy lacks the requested 60% on the first month
		givenFreeCapacity(request, busy, day -> day.isBefore(LocalDate.of(2026, 12, 1)) ? 20 : 100);
		givenFreeCapacity(request, free, day -> 100);

		List<CandidateDto> ranked = matchingService.rank(request);

		assertThat(ranked).extracting(CandidateDto::employeeId).containsExactly(2L, 1L);
		assertThat(ranked.get(0).breakdown().skills()).isEqualTo(ranked.get(1).breakdown().skills());
		assertThat(ranked.get(0).breakdown().availability()).isGreaterThan(ranked.get(1).breakdown().availability());
	}

	@Test
	void anEmployeeAlreadyProposedOrStaffedOnTheRequestIsNotInTheList() {
		StaffingRequest request = demoRequest();
		User taken = employee(1L, "Already", "Proposed", Seniority.MEDIOR);
		User other = employee(2L, "Still", "Free", Seniority.MEDIOR);
		givenCandidates(List.of(taken, other), List.of(1L), rating(other, JAVA, 4), rating(other, SPRING, 3));
		givenFreeCapacity(request, other, day -> 100);

		assertThat(matchingService.rank(request)).extracting(CandidateDto::employeeId).containsExactly(2L);
		verify(capacityService, never()).getFreeCapacity(eq(1L), any(), any());
	}

	@Test
	void theAllocationsThatBlockACandidateAreProposedApprovedAndChangePending() {
		StaffingRequest request = demoRequest();
		givenCandidates(List.of());

		matchingService.rank(request);

		// givenCandidates stubs the query with exactly this set, so a different set would fail the stubbing
		verify(allocationRepository).findEmployeeIdsByRequestAndStatuses(REQUEST_ID,
				AllocationStatus.ACTIVE_OR_PROPOSED);
		assertThat(AllocationStatus.ACTIVE_OR_PROPOSED).containsExactlyInAnyOrder(AllocationStatus.PROPOSED,
				AllocationStatus.APPROVED, AllocationStatus.CHANGE_PENDING);
	}

	// ---- skills (50%)

	@ParameterizedTest(name = "minimum {0}, level {1} → {2}")
	@CsvSource({ "2,2,35", "2,3,40", "2,4,45", "2,5,50", "1,5,50", "3,3,35" })
	void aSkillScoresSevenTenthsAtItsMinimumAndOneTenthMorePerLevelUpToOne(int minLevel, int level, int skills) {
		StaffingRequest request = request(Seniority.MEDIOR, 60, DEMO_START, DEMO_END);
		addSkill(request, JAVA, minLevel, true);
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate), rating(candidate, JAVA, level));
		givenFreeCapacity(request, candidate, day -> 100);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().skills()).isEqualTo(skills);
	}

	@Test
	void theSkillsComponentIsTheAverageOverMandatoryAndNiceToHaveSkills() {
		// Java 5 vs 4 → 0.8, Spring 3 vs 3 → 0.7, PostgreSQL 5 vs 2 → 1.0: 2.5 / 3 × 50 = 41.67
		StaffingRequest request = demoRequest();
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate), rating(candidate, JAVA, 5), rating(candidate, SPRING, 3),
				rating(candidate, POSTGRESQL, 5));
		givenFreeCapacity(request, candidate, day -> 100);

		assertThat(matchingService.rank(request).get(0).breakdown().skills()).isEqualTo(42);
	}

	@Test
	void aNiceToHaveSkillBelowItsMinimumScoresZeroAndIsAWarningNotAReason() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, DEMO_START, DEMO_END);
		addSkill(request, JAVA, 4, true);
		addSkill(request, POSTGRESQL, 2, false);
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate), rating(candidate, JAVA, 4), rating(candidate, POSTGRESQL, 1));
		givenFreeCapacity(request, candidate, day -> 100);

		CandidateDto result = matchingService.rank(request).get(0);

		// (0.7 + 0) / 2 × 50 = 17.5
		assertThat(result.breakdown().skills()).isEqualTo(18);
		assertThat(result.reasons()).containsExactly("Java 4/5 (required ≥ 4)");
		assertThat(result.warnings()).containsExactly("PostgreSQL 1/5 (nice to have ≥ 2)");
	}

	@Test
	void aRequestWithoutSkillsGivesEveryCandidateTheFullSkillsScore() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, DEMO_START, DEMO_END);
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> 100);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().skills()).isEqualTo(50);
		assertThat(result.score()).isEqualTo(100);
		assertThat(result.reasons()).isEmpty();
	}

	// ---- availability (40%)

	@Test
	void availabilityIsTheShareOfWorkingDaysWithEnoughFreeCapacity() {
		// 10 working days, 4 of them short
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(13));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> day.isBefore(nov(6)) ? 30 : 100);

		assertThat(matchingService.rank(request).get(0).breakdown().availability()).isEqualTo(24);
	}

	@Test
	void exactlyTheRequestedPercentIsEnough() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(13));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> 60);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().availability()).isEqualTo(40);
		assertThat(result.warnings()).isEmpty();
	}

	@Test
	void shortDaysAreGroupedIntoRangesAndAWeekendDoesNotSplitOne() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(13));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		// Mon–Tue short, Wed fine, then Thu–Fri and the next Mon short: the weekend between is one run
		List<LocalDate> shortDays = List.of(nov(2), nov(3), nov(5), nov(6), nov(9));
		givenFreeCapacity(request, candidate, day -> shortDays.contains(day) ? 40 : 100);

		assertThat(matchingService.rank(request).get(0).warnings()).containsExactly(
				"Insufficient capacity 2026-11-02 – 2026-11-03 (40% free, 60% required)",
				"Insufficient capacity 2026-11-05 – 2026-11-09 (40% free, 60% required)");
	}

	@Test
	void aSingleShortDayIsWrittenAsOneDateNotARange() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(6));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> day.equals(nov(4)) ? 10 : 100);

		assertThat(matchingService.rank(request).get(0).warnings())
			.containsExactly("Insufficient capacity 2026-11-04 (10% free, 60% required)");
	}

	@Test
	void aDifferentFreeCapacityStartsANewRange() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(6));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> day.isBefore(nov(4)) ? 40 : day.equals(nov(4)) ? 20 : 100);

		assertThat(matchingService.rank(request).get(0).warnings()).containsExactly(
				"Insufficient capacity 2026-11-02 – 2026-11-03 (40% free, 60% required)",
				"Insufficient capacity 2026-11-04 (20% free, 60% required)");
	}

	@Test
	void aPartTimeEmployeeWhoNeverHasEnoughStaysInTheListWithZeroAvailability() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(13));
		User partTime = employee(1L, "Part", "Timer", Seniority.MEDIOR);
		givenCandidates(List.of(partTime));
		givenFreeCapacity(request, partTime, day -> 50);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().availability()).isZero();
		assertThat(result.warnings())
			.containsExactly("Insufficient capacity 2026-11-02 – 2026-11-13 (50% free, 60% required)");
	}

	@Test
	void anOverbookedEmployeeShowsZeroFreeNotANegativePercent() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(6));
		User overbooked = employee(1L, "Over", "Booked", Seniority.MEDIOR);
		givenCandidates(List.of(overbooked));
		givenFreeCapacity(request, overbooked, day -> -20);

		assertThat(matchingService.rank(request).get(0).warnings())
			.containsExactly("Insufficient capacity 2026-11-02 – 2026-11-06 (0% free, 60% required)");
	}

	@Test
	void aRequestPeriodWithoutWorkingDaysHasNothingToFallShortOn() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(7), nov(8));
		User candidate = employee(1L, "Some", "One", Seniority.MEDIOR);
		givenCandidates(List.of(candidate));
		when(capacityService.getFreeCapacity(1L, nov(7), nov(8))).thenReturn(Map.of());

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().availability()).isEqualTo(40);
		assertThat(result.warnings()).isEmpty();
	}

	// ---- seniority (10%)

	@ParameterizedTest(name = "requested {0}, candidate {1} → {2}")
	@CsvSource({ "MEDIOR,MEDIOR,10", "JUNIOR,JUNIOR,10", "MEDIOR,SENIOR,5", "MEDIOR,JUNIOR,5", "SENIOR,MEDIOR,5",
			"JUNIOR,SENIOR,0", "SENIOR,JUNIOR,0" })
	void theSameSeniorityScoresTenAnAdjacentOneFiveAndAnyOtherZero(Seniority requested, Seniority actual,
			int seniority) {
		StaffingRequest request = request(requested, 60, nov(2), nov(6));
		User candidate = employee(1L, "Some", "One", actual);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> 100);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().seniority()).isEqualTo(seniority);
		if (requested == actual) {
			assertThat(result.warnings()).isEmpty();
		}
		else {
			assertThat(result.warnings()).containsExactly("Seniority " + actual + " (" + requested + " requested)");
		}
	}

	@Test
	void anEmployeeWithoutASeniorityScoresZeroAndIsAWarning() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(6));
		User candidate = employee(1L, "Some", "One", null);
		givenCandidates(List.of(candidate));
		givenFreeCapacity(request, candidate, day -> 100);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown().seniority()).isZero();
		assertThat(result.seniority()).isNull();
		assertThat(result.warnings()).containsExactly("Seniority not set (MEDIOR requested)");
	}

	// ---- score and order

	@Test
	void theScoreIsTheSumOfTheRoundedComponentsNotTheRoundedSumOfTheExactOnes() {
		// Skills (0.7 + 0) / 2 × 50 = 17.5 → 18, and availability 1 of 16 days = 2.5 → 3, so 21. The exact sum
		// is 20.0, which would round to 20
		StaffingRequest request = request(Seniority.SENIOR, 60, nov(2), nov(23));
		addSkill(request, JAVA, 4, true);
		addSkill(request, POSTGRESQL, 2, false);
		User candidate = employee(1L, "Some", "One", Seniority.JUNIOR);
		givenCandidates(List.of(candidate), rating(candidate, JAVA, 4));
		givenFreeCapacity(request, candidate, day -> day.equals(nov(23)) ? 100 : 0);

		CandidateDto result = matchingService.rank(request).get(0);

		assertThat(result.breakdown()).isEqualTo(new CandidateDto.Breakdown(18, 3, 0));
		assertThat(result.score()).isEqualTo(21);
	}

	@Test
	void aCandidateWithEverythingScoresOneHundred() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(13));
		addSkill(request, JAVA, 1, true);
		User candidate = employee(1L, "Top", "Candidate", Seniority.MEDIOR);
		givenCandidates(List.of(candidate), rating(candidate, JAVA, 5));
		givenFreeCapacity(request, candidate, day -> 100);

		assertThat(matchingService.rank(request).get(0).score()).isEqualTo(100);
	}

	@Test
	void equalRoundedScoresAreOrderedByTheExactScore() {
		// 55 of 65 days is 33.85 and 56 of 65 is 34.46: both round to 34, but the second is really better
		StaffingRequest request = demoRequest();
		User fewerDays = employee(1L, "Fewer", "Days", Seniority.MEDIOR);
		User moreDays = employee(2L, "More", "Days", Seniority.MEDIOR);
		givenCandidates(List.of(fewerDays, moreDays), rating(fewerDays, JAVA, 4), rating(fewerDays, SPRING, 3),
				rating(moreDays, JAVA, 4), rating(moreDays, SPRING, 3));
		givenFreeCapacity(request, fewerDays, shortOnTheFirstWorkingDays(10));
		givenFreeCapacity(request, moreDays, shortOnTheFirstWorkingDays(9));

		List<CandidateDto> ranked = matchingService.rank(request);

		assertThat(ranked.get(0).score()).isEqualTo(ranked.get(1).score());
		assertThat(ranked).extracting(c -> c.breakdown().availability()).containsExactly(34, 34);
		assertThat(ranked).extracting(CandidateDto::employeeId).containsExactly(2L, 1L);
	}

	@Test
	void identicalCandidatesAreOrderedByEmployeeId() {
		StaffingRequest request = demoRequest();
		User first = employee(1L, "First", "Twin", Seniority.MEDIOR);
		User second = employee(2L, "Second", "Twin", Seniority.MEDIOR);
		givenCandidates(List.of(second, first), rating(first, JAVA, 4), rating(first, SPRING, 3),
				rating(second, JAVA, 4), rating(second, SPRING, 3));
		givenFreeCapacity(request, first, day -> 100);
		givenFreeCapacity(request, second, day -> 100);

		assertThat(matchingService.rank(request)).extracting(CandidateDto::employeeId).containsExactly(1L, 2L);
	}

	@Test
	void theDepartmentAndSeniorityOfTheEmployeeAreInTheCandidate() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, nov(2), nov(6));
		User withDepartment = employee(1L, "Has", "Department", Seniority.SENIOR);
		withDepartment.setDepartment(new Department("Engineering"));
		User withoutDepartment = employee(2L, "No", "Department", Seniority.SENIOR);
		givenCandidates(List.of(withDepartment, withoutDepartment));
		givenFreeCapacity(request, withDepartment, day -> 100);
		givenFreeCapacity(request, withoutDepartment, day -> 100);

		List<CandidateDto> ranked = matchingService.rank(request);

		assertThat(ranked).extracting(CandidateDto::department).containsExactly("Engineering", null);
		assertThat(ranked).extracting(CandidateDto::seniority).containsExactly(Seniority.SENIOR, Seniority.SENIOR);
	}

	// ---- the endpoint's service method: access and paging

	@Test
	void getCandidatesReturnsTheRequestedPageAndTheTotal() {
		StaffingRequest request = demoRequest();
		AuthUser pm = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		List<User> users = new ArrayList<>();
		List<EmployeeSkill> ratings = new ArrayList<>();
		for (long id = 1; id <= 5; id++) {
			User user = employee(id, "Candidate", "No" + id, Seniority.MEDIOR);
			users.add(user);
			ratings.add(rating(user, JAVA, 4));
			ratings.add(rating(user, SPRING, 3));
			givenFreeCapacity(request, user, day -> 100);
		}
		givenCandidates(users, ratings.toArray(EmployeeSkill[]::new));

		Page<CandidateDto> second = matchingService.getCandidates(REQUEST_ID, pm, PageRequest.of(1, 2));
		Page<CandidateDto> last = matchingService.getCandidates(REQUEST_ID, pm, PageRequest.of(2, 2));
		Page<CandidateDto> beyond = matchingService.getCandidates(REQUEST_ID, pm, PageRequest.of(3, 2));

		assertThat(second.getContent()).extracting(CandidateDto::employeeId).containsExactly(3L, 4L);
		assertThat(second.getTotalElements()).isEqualTo(5);
		assertThat(second.getTotalPages()).isEqualTo(3);
		assertThat(last.getContent()).extracting(CandidateDto::employeeId).containsExactly(5L);
		assertThat(beyond.getContent()).isEmpty();
		assertThat(beyond.getTotalElements()).isEqualTo(5);
	}

	@Test
	void theRequestedSortIsIgnoredBecauseTheListIsAlwaysSortedByScore() {
		StaffingRequest request = demoRequest();
		AuthUser pm = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		User strong = employee(2L, "Aaa", "Strong", Seniority.MEDIOR);
		User weak = employee(1L, "Zzz", "Weak", Seniority.MEDIOR);
		givenCandidates(List.of(weak, strong), rating(weak, JAVA, 4), rating(weak, SPRING, 3), rating(strong, JAVA, 5),
				rating(strong, SPRING, 5));
		givenFreeCapacity(request, weak, day -> 100);
		givenFreeCapacity(request, strong, day -> 100);

		Page<CandidateDto> page = matchingService.getCandidates(REQUEST_ID, pm,
				PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "fullName")));

		assertThat(page.getContent()).extracting(CandidateDto::employeeId).containsExactly(2L, 1L);
	}

	// BR-4
	@Test
	void onlyThePmWhoOwnsTheProjectSeesTheCandidates() {
		StaffingRequest request = demoRequest();
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		AuthUser otherPm = new AuthUser(PM_ID + 1, "other@staffsync.local", Role.PM);

		assertThatThrownBy(() -> matchingService.getCandidates(REQUEST_ID, otherPm, PageRequest.of(0, 20)))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
				assertThat(ex.getCode()).isEqualTo("NOT_PROJECT_OWNER");
			});
		verifyNoInteractions(userRepository, employeeSkillRepository, allocationRepository, capacityService);
	}

	// BR-9
	@ParameterizedTest
	@EnumSource(value = RequestStatus.class, names = { "FILLED", "CANCELLED" })
	void aFilledOrCancelledRequestHasNoCandidates(RequestStatus status) {
		StaffingRequest request = demoRequest();
		request.setStatus(status);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		AuthUser pm = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);

		assertThatThrownBy(() -> matchingService.getCandidates(REQUEST_ID, pm, PageRequest.of(0, 20)))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo("REQUEST_NOT_OPEN");
				assertThat(ex.getMessage()).endsWith("but this one is " + status.name().toLowerCase());
			});
		verifyNoInteractions(userRepository, employeeSkillRepository, allocationRepository, capacityService);
	}

	// BR-9
	@ParameterizedTest
	@EnumSource(value = RequestStatus.class, names = { "OPEN", "PARTIALLY_FILLED" })
	void anOpenOrPartiallyFilledRequestHasCandidates(RequestStatus status) {
		StaffingRequest request = demoRequest();
		request.setStatus(status);
		AuthUser pm = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		givenCandidates(List.of());

		assertThat(matchingService.getCandidates(REQUEST_ID, pm, PageRequest.of(0, 20)).getTotalElements()).isZero();
	}

	@Test
	void theOwnerIsCheckedBeforeTheStatusSoAnotherPmLearnsNothingAboutIt() {
		StaffingRequest request = demoRequest();
		request.setStatus(RequestStatus.CANCELLED);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		AuthUser otherPm = new AuthUser(PM_ID + 1, "other@staffsync.local", Role.PM);

		assertThatThrownBy(() -> matchingService.getCandidates(REQUEST_ID, otherPm, PageRequest.of(0, 20)))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
	}

	@Test
	void anUnknownRequestIsNotFound() {
		when(requestRepository.findById(99L)).thenReturn(Optional.empty());
		AuthUser pm = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);

		assertThatThrownBy(() -> matchingService.getCandidates(99L, pm, PageRequest.of(0, 20)))
			.isInstanceOf(NotFoundException.class);
	}

	// ---- helpers

	/** §4: MEDIOR, 60%, 1.11–31.1, Java ≥ 4 and Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have. */
	private StaffingRequest demoRequest() {
		StaffingRequest request = request(Seniority.MEDIOR, 60, DEMO_START, DEMO_END);
		addSkill(request, JAVA, 4, true);
		addSkill(request, SPRING, 3, true);
		addSkill(request, POSTGRESQL, 2, false);
		return request;
	}

	private StaffingRequest request(Seniority seniority, int percent, LocalDate start, LocalDate end) {
		User pm = mock(User.class);
		Project project = mock(Project.class);
		// Only the access tests read the owner
		lenient().when(pm.getId()).thenReturn(PM_ID);
		lenient().when(project.getPm()).thenReturn(pm);
		StaffingRequest request = new StaffingRequest(project, "Java Developer", seniority, percent, start, end, 2);
		ReflectionTestUtils.setField(request, "id", REQUEST_ID);
		return request;
	}

	/** Adds the skill the way the service layer does (the method is package-private). */
	private static void addSkill(StaffingRequest request, Skill skill, int minLevel, boolean mandatory) {
		ReflectionTestUtils.invokeMethod(request, "putSkill", skill, minLevel, mandatory);
	}

	private static Skill skill(Long id, String name, SkillCategory category) {
		Skill skill = new Skill(name, category);
		ReflectionTestUtils.setField(skill, "id", id);
		return skill;
	}

	private static User employee(Long id, String firstName, String lastName, Seniority seniority) {
		User user = new User(firstName.toLowerCase() + id + "@staffsync.local", "hash", firstName, lastName,
				Role.EMPLOYEE);
		ReflectionTestUtils.setField(user, "id", id);
		user.setSeniority(seniority);
		return user;
	}

	private static EmployeeSkill rating(User user, Skill skill, int level) {
		return new EmployeeSkill(user, skill, level, 1);
	}

	private void givenCandidates(List<User> employees, EmployeeSkill... ratings) {
		givenCandidates(employees, List.of(), ratings);
	}

	/** The active employees, who is already on the request, and the skill ratings of the employees. */
	private void givenCandidates(List<User> employees, List<Long> alreadyOnRequest, EmployeeSkill... ratings) {
		when(userRepository.findByRoleAndActiveTrue(Role.EMPLOYEE)).thenReturn(employees);
		when(allocationRepository.findEmployeeIdsByRequestAndStatuses(REQUEST_ID, AllocationStatus.ACTIVE_OR_PROPOSED))
			.thenReturn(alreadyOnRequest);
		if (employees.size() > alreadyOnRequest.size()) {
			when(employeeSkillRepository.findByUserIdIn(anyCollection())).thenReturn(List.of(ratings));
		}
	}

	/** The free capacity of the employee on each working day of the request, from the day's date. */
	private void givenFreeCapacity(StaffingRequest request, User employee, Function<LocalDate, Integer> freeOn) {
		Map<LocalDate, Integer> free = new TreeMap<>();
		for (LocalDate day = request.getStartDate(); !day.isAfter(request.getEndDate()); day = day.plusDays(1)) {
			if (!isWeekend(day)) {
				free.put(day, freeOn.apply(day));
			}
		}
		when(capacityService.getFreeCapacity(employee.getId(), request.getStartDate(), request.getEndDate()))
			.thenReturn(free);
	}

	/** 0% free on the first {@code count} working days of the demo period, and 100% after. */
	private Function<LocalDate, Integer> shortOnTheFirstWorkingDays(int count) {
		List<LocalDate> shortDays = new ArrayList<>();
		for (LocalDate day = DEMO_START; shortDays.size() < count; day = day.plusDays(1)) {
			if (!isWeekend(day)) {
				shortDays.add(day);
			}
		}
		return day -> shortDays.contains(day) ? 0 : 100;
	}

	private static boolean isWeekend(LocalDate day) {
		return day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY;
	}

	private static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

}
