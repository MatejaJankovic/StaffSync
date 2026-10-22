package com.staffsync.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.staffsync.allocation.dto.AllocationDto;
import com.staffsync.allocation.dto.AllocationProposalDto;
import com.staffsync.allocation.dto.MissingSkill;
import com.staffsync.allocation.dto.ProposeAllocationRequest;
import com.staffsync.allocation.dto.RejectAllocationRequest;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectStatus;
import com.staffsync.request.RequestSkill;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillCategory;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link AllocationService} (US-08). The request is the §4 demo one: 60%,
 * 2026-11-01 – 2027-01-31, Java ≥ 4 and Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have.
 * November 2026 starts on a Sunday, so the 2nd is a Monday.
 */
@ExtendWith(MockitoExtension.class)
class AllocationServiceTests {

	static final Long PM_ID = 2L;

	static final Long EMPLOYEE_ID = 4L;

	static final Long REQUEST_ID = 10L;

	static final AuthUser PM = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);

	static final Long RM_ID = 3L;

	static final Long ALLOCATION_ID = 20L;

	static final AuthUser RM = new AuthUser(RM_ID, "rm@staffsync.local", Role.RM);

	@Mock
	AllocationRepository allocationRepository;

	@Mock
	StaffingRequestRepository requestRepository;

	@Mock
	UserRepository userRepository;

	@Mock
	EmployeeSkillRepository employeeSkillRepository;

	@Mock
	CapacityService capacityService;

	@InjectMocks
	AllocationService allocationService;

	User pm;

	User employee;

	Project project;

	StaffingRequest request;

	Skill java = skill(1L, "Java");

	Skill spring = skill(2L, "Spring");

	Skill postgres = skill(3L, "PostgreSQL");

	@BeforeEach
	void setUp() {
		pm = user(PM_ID, Role.PM);
		employee = user(EMPLOYEE_ID, Role.EMPLOYEE);
		project = new Project("Project Alpha", "Acme", null, nov(1), LocalDate.of(2027, 3, 31), pm);
		ReflectionTestUtils.setField(project, "id", 1L);
		request = new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60, nov(1),
				LocalDate.of(2027, 1, 31), 2);
		ReflectionTestUtils.setField(request, "id", REQUEST_ID);
		request.getSkills()
			.addAll(List.of(requestSkill(java, 4, true), requestSkill(spring, 3, true),
					requestSkill(postgres, 2, false)));
	}

	// ---- the happy path

	@Test
	void percentAndPeriodDefaultToTheRequest() {
		givenEligibleProposal();

		AllocationProposalDto result = allocationService.propose(body(null, null, null), PM);

		Allocation saved = savedAllocation();
		assertThat(saved.getStatus()).isEqualTo(AllocationStatus.PROPOSED);
		assertThat(saved.getPercent()).isEqualTo(60);
		assertThat(saved.getStartDate()).isEqualTo(nov(1));
		assertThat(saved.getEndDate()).isEqualTo(LocalDate.of(2027, 1, 31));
		assertThat(saved.getEmployee()).isSameAs(employee);
		assertThat(saved.getProposedBy()).isSameAs(pm);
		assertThat(saved.getCreatedAt()).isNotNull();
		assertThat(result.allocation().employeeName()).isEqualTo("First4 Last");
		assertThat(result.allocation().projectName()).isEqualTo("Project Alpha");
		assertThat(result.allocation().requestTitle()).isEqualTo("Java Developer");
		assertThat(result.warnings()).isEmpty();
	}

	@Test
	void theGivenPercentAndPeriodAreUsed() {
		givenEligibleProposal();

		allocationService.propose(body(40, nov(15), nov(30)), PM);

		Allocation saved = savedAllocation();
		assertThat(saved.getPercent()).isEqualTo(40);
		assertThat(saved.getStartDate()).isEqualTo(nov(15));
		assertThat(saved.getEndDate()).isEqualTo(nov(30));
	}

	@Test
	void onlyTheStartCanBeGivenAndTheEndStaysTheRequests() {
		givenEligibleProposal();

		allocationService.propose(body(null, nov(15), null), PM);

		assertThat(savedAllocation().getEndDate()).isEqualTo(LocalDate.of(2027, 1, 31));
	}

	@Test
	void aPartiallyFilledRequestTakesProposals() {
		request.setStatus(RequestStatus.PARTIALLY_FILLED);
		givenEligibleProposal();

		allocationService.propose(body(null, null, null), PM);

		verify(allocationRepository).save(any(Allocation.class));
	}

	@Test
	void aPeriodCoveringTheWholeRequestIsAllowed() {
		givenEligibleProposal();

		allocationService.propose(body(null, nov(1), LocalDate.of(2027, 1, 31)), PM);

		verify(allocationRepository).save(any(Allocation.class));
	}

	// ---- BR-4 / T-11

	@Test
	void anotherPmIsForbiddenBeforeAnythingElseIsChecked() {
		givenRequest();
		AuthUser otherPm = new AuthUser(99L, "other@staffsync.local", Role.PM);

		// The period is invalid too, but the owner check comes first
		assertThatThrownBy(() -> allocationService.propose(body(null, nov(20), nov(10)), otherPm))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
				assertThat(ex.getCode()).isEqualTo("NOT_PROJECT_OWNER");
			});
		verify(allocationRepository, never()).save(any());
	}

	@Test
	void anUnknownRequestIsNotFound() {
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> allocationService.propose(body(null, null, null), PM))
			.isInstanceOf(NotFoundException.class)
			.hasMessage("Staffing request 10 not found");
	}

	// ---- BR-3 / T-09, T-10

	@Test
	void startingBeforeTheRequestIsOutsideIt() {
		givenRequest();

		assertRejected(body(null, LocalDate.of(2026, 10, 31), null), HttpStatus.BAD_REQUEST,
				"ALLOCATION_OUTSIDE_REQUEST");
	}

	@Test
	void endingAfterTheRequestIsOutsideIt() {
		givenRequest();

		assertRejected(body(null, null, LocalDate.of(2027, 2, 1)), HttpStatus.BAD_REQUEST,
				"ALLOCATION_OUTSIDE_REQUEST");
	}

	@Test
	void endBeforeStartIsAnInvalidPeriod() {
		givenRequest();

		assertRejected(body(null, nov(20), nov(10)), HttpStatus.BAD_REQUEST, "INVALID_PERIOD");
	}

	@Test
	void aDefaultedEndBeforeTheGivenStartIsAnInvalidPeriod() {
		givenRequest();

		assertRejected(body(null, LocalDate.of(2027, 2, 15), null), HttpStatus.BAD_REQUEST, "INVALID_PERIOD");
	}

	@Test
	void aPercentThatIsNotAStepOfTenIsAValidationError() {
		givenRequest();

		assertThatThrownBy(() -> allocationService.propose(body(65, null, null), PM))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getCode()).isEqualTo("VALIDATION_ERROR");
				assertThat(ex.getDetails()).hasSize(1);
			});
	}

	// ---- BR-9 / T-17

	@ParameterizedTest
	@EnumSource(value = RequestStatus.class, names = { "FILLED", "CANCELLED" })
	void aFilledOrCancelledRequestTakesNoProposals(RequestStatus status) {
		request.setStatus(status);
		givenRequest();

		assertRejected(body(null, null, null), HttpStatus.CONFLICT, "REQUEST_NOT_OPEN");
	}

	@ParameterizedTest
	@EnumSource(value = ProjectStatus.class, names = { "COMPLETED", "CANCELLED" })
	void aClosedProjectTakesNoProposals(ProjectStatus status) {
		project.setStatus(status);
		givenRequest();

		assertRejected(body(null, null, null), HttpStatus.CONFLICT, "PROJECT_CLOSED");
	}

	// ---- BR-9 / T-18

	@Test
	void anUnknownEmployeeIsNotFound() {
		givenRequest();
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> allocationService.propose(body(null, null, null), PM))
			.isInstanceOf(NotFoundException.class)
			.hasMessage("Employee 4 not found");
	}

	@Test
	void anInactiveEmployeeIsNotEligible() {
		employee.setActive(false);
		givenRequest();
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee));

		assertRejected(body(null, null, null), HttpStatus.BAD_REQUEST, "EMPLOYEE_NOT_ELIGIBLE");
	}

	@Test
	void aUserWithAnotherRoleIsNotEligible() {
		employee.setRole(Role.RM);
		givenRequest();
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee));

		assertRejected(body(null, null, null), HttpStatus.BAD_REQUEST, "EMPLOYEE_NOT_ELIGIBLE");
	}

	@Test
	void everyMissingOrTooLowMandatorySkillIsListed() {
		givenRequest();
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee));
		// Java one level too low, no Spring at all
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(EMPLOYEE_ID))
			.thenReturn(List.of(new EmployeeSkill(employee, java, 3, 2), new EmployeeSkill(employee, postgres, 5, 4)));

		assertThatThrownBy(() -> allocationService.propose(body(null, null, null), PM))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
				assertThat(ex.getCode()).isEqualTo("MISSING_MANDATORY_SKILLS");
				assertThat(ex.getMessage()).contains("Java (level 4 or more)", "Spring (level 3 or more)");
				assertThat((List<Object>) ex.getDetails()).containsExactly(new MissingSkill(1L, "Java", 4, 3),
						new MissingSkill(2L, "Spring", 3, null));
			});
		verify(allocationRepository, never()).save(any());
	}

	@Test
	void aMissingNiceToHaveSkillDoesNotMatter() {
		givenRequest();
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee));
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(EMPLOYEE_ID))
			.thenReturn(List.of(new EmployeeSkill(employee, java, 4, 3), new EmployeeSkill(employee, spring, 3, 2)));
		when(allocationRepository.save(any(Allocation.class))).thenAnswer(call -> call.getArgument(0));

		allocationService.propose(body(null, null, null), PM);

		verify(allocationRepository).save(any(Allocation.class));
	}

	// ---- BR-8 / T-16

	@Test
	void anOverlappingAllocationOnTheSameRequestIsAConflict() {
		givenRequest();
		givenEligibleEmployee();
		when(allocationRepository.existsOverlappingOnRequest(REQUEST_ID, EMPLOYEE_ID, nov(1),
				LocalDate.of(2027, 1, 31), AllocationStatus.ACTIVE_OR_PROPOSED))
			.thenReturn(true);

		assertRejected(body(null, null, null), HttpStatus.CONFLICT, "ALLOCATION_OVERLAP");
	}

	// ---- BR-2 / T-08

	@Test
	void goingOverCapacityStillProposesButWarnsPerRunOfDays() {
		givenEligibleProposal();
		// Mon 2 – Fri 6 and Mon 9 – Tue 10 at 120% (the weekend doesn't break the run), Wed 11 at 150%,
		// then Mon 16 at 120% again after a gap
		when(capacityService.findOverloadedDays(eq(EMPLOYEE_ID), eq(nov(1)), eq(LocalDate.of(2027, 1, 31)), eq(60),
				isNull(), eq(true)))
			.thenReturn(List.of(day(2, 120), day(3, 120), day(4, 120), day(5, 120), day(6, 120), day(9, 120),
					day(10, 120), day(11, 150), day(16, 120)));

		AllocationProposalDto result = allocationService.propose(body(null, null, null), PM);

		verify(allocationRepository).save(any(Allocation.class));
		assertThat(result.allocation().status()).isEqualTo(AllocationStatus.PROPOSED);
		assertThat(result.warnings()).containsExactly(
				"Capacity would be exceeded on 2026-11-02 – 2026-11-10 (120%)",
				"Capacity would be exceeded on 2026-11-11 (150%)",
				"Capacity would be exceeded on 2026-11-16 (120%)");
	}

	@Test
	void capacityIsCheckedWithProposedAllocationsAndTheProposedPercent() {
		givenEligibleProposal();

		allocationService.propose(body(40, nov(15), nov(30)), PM);

		verify(capacityService).findOverloadedDays(EMPLOYEE_ID, nov(15), nov(30), 40, null, true);
	}

	// ---- approve (US-10)

	@Test
	void theRmApprovesAndTheDecisionIsRecorded() {
		Allocation allocation = givenProposedAllocation();

		AllocationDto result = allocationService.approve(ALLOCATION_ID, RM);

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(allocation.getDecidedBy().getId()).isEqualTo(RM_ID);
		assertThat(allocation.getDecidedAt()).isNotNull();
		assertThat(allocation.getDecisionComment()).isNull();
		assertThat(result.status()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(result.decidedById()).isEqualTo(RM_ID);
		assertThat(result.decidedByName()).isEqualTo("First3 Last");
	}

	@Test
	void approvalRunsTheHardCapacityCheckOnTheAllocationsPeriodAndPercent() {
		givenProposedAllocation();

		allocationService.approve(ALLOCATION_ID, RM);

		// Active allocations only (BR-1), so the PROPOSED ones of other requests don't block it (BR-2)
		verify(capacityService).checkCapacity(EMPLOYEE_ID, nov(1), LocalDate.of(2027, 1, 31), 60, null);
	}

	@Test
	void aCapacityBreachLeavesTheAllocationProposed() {
		Allocation allocation = givenProposedAllocation();
		BusinessException exceeded = new BusinessException(HttpStatus.CONFLICT, CapacityService.CAPACITY_EXCEEDED,
				"Capacity exceeded on 2026-11-02 (60% existing + 60% new = 120%)", List.of(day(2, 120)));
		doThrow(exceeded).when(capacityService).checkCapacity(any(), any(), any(), anyInt(), any());

		assertThatThrownBy(() -> allocationService.approve(ALLOCATION_ID, RM)).isSameAs(exceeded);
		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.PROPOSED);
		assertThat(allocation.getDecidedBy()).isNull();
		assertThat(allocation.getDecidedAt()).isNull();
	}

	@Test
	void anUnknownAllocationIsNotFound() {
		when(allocationRepository.findById(ALLOCATION_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> allocationService.approve(ALLOCATION_ID, RM)).isInstanceOf(NotFoundException.class);
	}

	// ---- BR-5 / T-12, T-13

	@Test
	void anRmOfAnotherTeamIsForbidden() {
		givenProposedAllocation();
		AuthUser otherRm = new AuthUser(9L, "other-rm@staffsync.local", Role.RM);

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, otherRm), HttpStatus.FORBIDDEN,
				"NOT_RESOURCE_MANAGER");
	}

	@ParameterizedTest
	@EnumSource(value = Role.class, names = { "EMPLOYEE", "PM", "ADMIN" })
	void anotherRoleIsForbiddenEvenWithTheManagersId(Role role) {
		givenProposedAllocation();

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, new AuthUser(RM_ID, "x", role)),
				HttpStatus.FORBIDDEN, "NOT_RESOURCE_MANAGER");
	}

	@Test
	void anEmployeeWithoutAnRmCannotBeDecidedOn() {
		givenProposedAllocation();
		employee.setManager(null);

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, RM), HttpStatus.FORBIDDEN,
				"NOT_RESOURCE_MANAGER");
	}

	// ---- BR-7 / T-15

	@ParameterizedTest
	@EnumSource(value = AllocationStatus.class, names = "PROPOSED", mode = EnumSource.Mode.EXCLUDE)
	void onlyAProposedAllocationCanBeApproved(AllocationStatus status) {
		givenProposedAllocation().setStatus(status);

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, RM), HttpStatus.CONFLICT,
				"INVALID_ALLOCATION_STATUS");
	}

	@ParameterizedTest
	@EnumSource(value = RequestStatus.class, names = { "FILLED", "CANCELLED" })
	void aFilledOrCancelledRequestTakesNoApprovals(RequestStatus status) {
		givenProposedAllocation();
		request.setStatus(status);

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, RM), HttpStatus.CONFLICT,
				"REQUEST_NOT_OPEN");
	}

	@ParameterizedTest
	@EnumSource(value = ProjectStatus.class, names = { "COMPLETED", "CANCELLED" })
	void aClosedProjectTakesNoApprovals(ProjectStatus status) {
		givenProposedAllocation();
		project.setStatus(status);

		assertDecisionFails(() -> allocationService.approve(ALLOCATION_ID, RM), HttpStatus.CONFLICT,
				"PROJECT_CLOSED");
	}

	// ---- reject (US-10; the comment length, BR-6 / T-14, is Bean Validation, see AllocationControllerTests)

	@Test
	void theRmRejectsWithACommentAndTheDecisionIsRecorded() {
		Allocation allocation = givenProposedAllocation();

		AllocationDto result = allocationService.reject(ALLOCATION_ID, rejection(), RM);

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.REJECTED);
		assertThat(allocation.getDecidedBy().getId()).isEqualTo(RM_ID);
		assertThat(allocation.getDecidedAt()).isNotNull();
		assertThat(allocation.getDecisionComment()).isEqualTo("Fully booked on Project Beta until December");
		assertThat(result.decisionComment()).isEqualTo("Fully booked on Project Beta until December");
		// A proposal was never active, so neither the capacity nor the request status is touched
		assertThat(request.getStatus()).isEqualTo(RequestStatus.OPEN);
		verify(capacityService, never()).checkCapacity(any(), any(), any(), anyInt(), any());
	}

	@Test
	void anRmOfAnotherTeamCannotReject() {
		givenProposedAllocation();
		AuthUser otherRm = new AuthUser(9L, "other-rm@staffsync.local", Role.RM);

		assertDecisionFails(() -> allocationService.reject(ALLOCATION_ID, rejection(), otherRm),
				HttpStatus.FORBIDDEN, "NOT_RESOURCE_MANAGER");
	}

	@ParameterizedTest
	@EnumSource(value = AllocationStatus.class, names = "PROPOSED", mode = EnumSource.Mode.EXCLUDE)
	void onlyAProposedAllocationCanBeRejected(AllocationStatus status) {
		givenProposedAllocation().setStatus(status);

		assertDecisionFails(() -> allocationService.reject(ALLOCATION_ID, rejection(), RM), HttpStatus.CONFLICT,
				"INVALID_ALLOCATION_STATUS");
	}

	// ---- search (the role scoping runs in the database, see AllocationControllerTests)

	@Test
	void searchFailsClosedForAPrincipalWithoutARole() {
		AuthUser noRole = new AuthUser(5L, "odd@staffsync.local", null);

		assertThatThrownBy(() -> allocationService.search(null, null, null, null, null, PageRequest.of(0, 20), noRole))
			.isInstanceOf(NullPointerException.class);
		verify(allocationRepository, never()).findAll(any(Specification.class), any(Pageable.class));
	}

	@Test
	void searchRejectsFromAfterTo() {
		assertThatThrownBy(() -> allocationService.search(null, null, null, nov(20), nov(10), PageRequest.of(0, 20),
				PM))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_PERIOD"));
		verify(allocationRepository, never()).findAll(any(Specification.class), any(Pageable.class));
	}

	@Test
	void searchRejectsAnUnknownSortProperty() {
		assertThatThrownBy(() -> allocationService.search(null, null, null, null, null,
				PageRequest.of(0, 20, Sort.by("employee")), PM))
			.isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("INVALID_SORT"));
	}

	@Test
	void searchAddsTheIdAsTheLastSortKey() {
		when(allocationRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());

		allocationService.search(null, null, null, nov(1), nov(1), PageRequest.of(2, 10, Sort.by("startDate")), PM);

		ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
		verify(allocationRepository).findAll(any(Specification.class), captor.capture());
		assertThat(captor.getValue().getPageNumber()).isEqualTo(2);
		assertThat(captor.getValue().getSort()).isEqualTo(Sort.by("startDate").and(Sort.by("id")));
	}

	// ---- helpers

	private void givenRequest() {
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
	}

	/** Java 5 and Spring 4: meets both mandatory skills. */
	private void givenEligibleEmployee() {
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee));
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(EMPLOYEE_ID))
			.thenReturn(List.of(new EmployeeSkill(employee, java, 5, 6), new EmployeeSkill(employee, spring, 4, 4)));
	}

	private void givenEligibleProposal() {
		givenRequest();
		givenEligibleEmployee();
		when(allocationRepository.save(any(Allocation.class))).thenAnswer(call -> call.getArgument(0));
	}

	/** The employee's RM is {@link #RM}, and the allocation is the request's 60% over its whole period. */
	private Allocation givenProposedAllocation() {
		employee.setManager(user(RM_ID, Role.RM));
		Allocation allocation = new Allocation(request, employee, 60, nov(1), LocalDate.of(2027, 1, 31), pm);
		ReflectionTestUtils.setField(allocation, "id", ALLOCATION_ID);
		when(allocationRepository.findById(ALLOCATION_ID)).thenReturn(Optional.of(allocation));
		return allocation;
	}

	/** A failed decision changes nothing: the capacity isn't checked and no decision is recorded. */
	private void assertDecisionFails(ThrowingCallable decision, HttpStatus status, String code) {
		assertThatThrownBy(decision).isInstanceOfSatisfying(BusinessException.class, ex -> {
			assertThat(ex.getStatus()).isEqualTo(status);
			assertThat(ex.getCode()).isEqualTo(code);
		});
		verify(capacityService, never()).checkCapacity(any(), any(), any(), anyInt(), any());
		Allocation allocation = allocationRepository.findById(ALLOCATION_ID).orElseThrow();
		assertThat(allocation.getDecidedBy()).isNull();
		assertThat(allocation.getDecidedAt()).isNull();
	}

	private Allocation savedAllocation() {
		ArgumentCaptor<Allocation> captor = ArgumentCaptor.forClass(Allocation.class);
		verify(allocationRepository).save(captor.capture());
		return captor.getValue();
	}

	private void assertRejected(ProposeAllocationRequest body, HttpStatus status, String code) {
		assertThatThrownBy(() -> allocationService.propose(body, PM))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(status);
				assertThat(ex.getCode()).isEqualTo(code);
			});
		verify(allocationRepository, never()).save(any());
	}

	static RejectAllocationRequest rejection() {
		return new RejectAllocationRequest("Fully booked on Project Beta until December");
	}

	static ProposeAllocationRequest body(Integer percent, LocalDate start, LocalDate end) {
		return new ProposeAllocationRequest(REQUEST_ID, EMPLOYEE_ID, percent, start, end);
	}

	static User user(Long id, Role role) {
		User user = new User("user" + id + "@staffsync.local", "hash", "First" + id, "Last", role);
		ReflectionTestUtils.setField(user, "id", id);
		return user;
	}

	static Skill skill(Long id, String name) {
		Skill skill = new Skill(name, SkillCategory.BACKEND);
		ReflectionTestUtils.setField(skill, "id", id);
		return skill;
	}

	/** RequestSkill can only be built inside its package, and only some tests read every field. */
	static RequestSkill requestSkill(Skill skill, int minLevel, boolean mandatory) {
		RequestSkill requestSkill = mock(RequestSkill.class, withSettings().strictness(Strictness.LENIENT));
		when(requestSkill.getSkill()).thenReturn(skill);
		when(requestSkill.getMinLevel()).thenReturn(minLevel);
		when(requestSkill.isMandatory()).thenReturn(mandatory);
		return requestSkill;
	}

	static Map<String, Object> day(int dayOfNovember, int load) {
		return Map.of("date", nov(dayOfNovember), "load", load);
	}

	static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

}
