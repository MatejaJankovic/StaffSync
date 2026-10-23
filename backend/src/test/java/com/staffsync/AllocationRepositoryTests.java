package com.staffsync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import jakarta.persistence.EntityManager;
import org.hibernate.Hibernate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs {@code findOverlapping} and the V7 constraints against the real PostgreSQL schema, which the mocked
 * {@code CapacityServiceTests} cannot do: the inclusive period ends (T-03, T-04), the status filter, the
 * optional {@code excludeId} (BR-15) and the CHECK constraints.
 */
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest
@Transactional
class AllocationRepositoryTests {

	@Autowired
	AllocationRepository allocationRepository;

	@Autowired
	UserRepository userRepository;

	@Autowired
	ProjectRepository projectRepository;

	@Autowired
	StaffingRequestRepository requestRepository;

	@Autowired
	EntityManager entityManager;

	User pm;

	User employee;

	StaffingRequest request;

	@BeforeEach
	void setUp() {
		pm = userRepository.findByEmailIgnoreCase("mateja_pm@staffsync.local").orElseThrow();
		employee = userRepository.save(new User(UUID.randomUUID() + "@staffsync.local", "hash", "Test", "Employee",
				Role.EMPLOYEE));
		Project project = projectRepository
			.save(new Project("Capacity test", "Client", null, nov(1), LocalDate.of(2027, 3, 31), pm));
		request = requestRepository
			.save(new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60, nov(1), nov(30), 1));
	}

	@Test
	void anAllocationEndingOnTheFirstDayOfThePeriodOverlaps() {
		Allocation existing = save(40, nov(2), nov(10), AllocationStatus.APPROVED);

		assertThat(overlapping(nov(10), nov(20), null)).containsExactly(existing);
	}

	@Test
	void anAllocationEndingTheDayBeforeThePeriodDoesNotOverlap() {
		save(40, nov(2), nov(9), AllocationStatus.APPROVED);

		assertThat(overlapping(nov(10), nov(20), null)).isEmpty();
	}

	@Test
	void anAllocationStartingOnTheLastDayOfThePeriodOverlaps() {
		Allocation existing = save(40, nov(20), nov(27), AllocationStatus.APPROVED);

		assertThat(overlapping(nov(10), nov(20), null)).containsExactly(existing);
	}

	@Test
	void anAllocationInsideOrAroundThePeriodOverlaps() {
		Allocation inside = save(10, nov(12), nov(13), AllocationStatus.APPROVED);
		Allocation around = save(20, nov(1), nov(30), AllocationStatus.CHANGE_PENDING);

		assertThat(overlapping(nov(10), nov(20), null)).containsExactlyInAnyOrder(inside, around);
	}

	@Test
	void onlyTheRequestedStatusesAreReturned() {
		Allocation approved = save(40, nov(2), nov(20), AllocationStatus.APPROVED);
		Allocation proposed = save(30, nov(2), nov(20), AllocationStatus.PROPOSED);
		save(30, nov(2), nov(20), AllocationStatus.REJECTED);
		save(30, nov(2), nov(20), AllocationStatus.CANCELLED);

		assertThat(overlapping(nov(2), nov(20), null)).containsExactly(approved);
		assertThat(allocationRepository.findOverlapping(employee.getId(), nov(2), nov(20),
				AllocationStatus.ACTIVE_OR_PROPOSED, null))
			.containsExactlyInAnyOrder(approved, proposed);
	}

	@Test
	void theExcludedAllocationIsLeftOutAndNullKeepsAll() {
		Allocation changing = save(60, nov(2), nov(20), AllocationStatus.CHANGE_PENDING);
		Allocation other = save(30, nov(2), nov(20), AllocationStatus.APPROVED);

		assertThat(overlapping(nov(2), nov(20), changing.getId())).containsExactly(other);
		assertThat(overlapping(nov(2), nov(20), null)).containsExactlyInAnyOrder(changing, other);
	}

	@Test
	void otherEmployeesAreNotReturned() {
		User someoneElse = userRepository
			.save(new User(UUID.randomUUID() + "@staffsync.local", "hash", "Other", "Employee", Role.EMPLOYEE));
		allocationRepository.saveAndFlush(approvedFor(someoneElse, 50, nov(2), nov(20)));

		assertThat(overlapping(nov(2), nov(20), null)).isEmpty();
	}

	@Test
	void thePercentMustBeInStepsOfTen() {
		assertThatThrownBy(() -> save(35, nov(2), nov(20), AllocationStatus.APPROVED))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void theEndDateCannotBeBeforeTheStartDate() {
		assertThatThrownBy(() -> save(40, nov(20), nov(2), AllocationStatus.APPROVED))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	// ---- pending approvals (US-14)

	@Test
	void pendingApprovalsAreTheTeamsProposedAndChangePendingAllocations() {
		User rm = newRm();
		employee.setManager(rm);
		Allocation proposed = save(30, nov(2), nov(6), AllocationStatus.PROPOSED);
		Allocation changePending = save(30, nov(9), nov(13), AllocationStatus.CHANGE_PENDING);
		save(30, nov(16), nov(20), AllocationStatus.APPROVED);
		save(30, nov(16), nov(20), AllocationStatus.REJECTED);
		save(30, nov(16), nov(20), AllocationStatus.CANCELLED);
		User outsider = userRepository
			.save(new User(UUID.randomUUID() + "@staffsync.local", "hash", "Other", "Employee", Role.EMPLOYEE));
		allocationRepository.saveAndFlush(new Allocation(request, outsider, 30, nov(2), nov(6), pm));

		assertThat(pending(rm).getContent()).containsExactlyInAnyOrder(proposed, changePending);
	}

	@Test
	void pendingApprovalsLoadWhatTheListShowsInTheSameQuery() {
		User rm = newRm();
		employee.setManager(rm);
		save(30, nov(2), nov(6), AllocationStatus.PROPOSED);
		entityManager.clear();

		Allocation loaded = pending(rm).getContent().get(0);

		// No query per row for what the DTO reads: the employee, the request, its project and the proposer
		assertThat(Hibernate.isInitialized(loaded.getEmployee())).isTrue();
		assertThat(Hibernate.isInitialized(loaded.getRequest())).isTrue();
		assertThat(Hibernate.isInitialized(loaded.getRequest().getProject())).isTrue();
		assertThat(Hibernate.isInitialized(loaded.getProposedBy())).isTrue();
	}

	// ---- closing a project (BR-11)

	@Test
	void closingAProjectFindsTheProposedAndActiveAllocationsOnAllItsRequestsOnly() {
		Allocation proposed = save(30, nov(2), nov(6), AllocationStatus.PROPOSED);
		Allocation approved = save(30, nov(9), nov(13), AllocationStatus.APPROVED);
		save(30, nov(16), nov(20), AllocationStatus.REJECTED);
		save(30, nov(16), nov(20), AllocationStatus.CANCELLED);
		StaffingRequest second = requestRepository.save(new StaffingRequest(request.getProject(), "QA Engineer",
				Seniority.JUNIOR, 50, nov(1), nov(30), 1));
		Allocation changePending = new Allocation(second, employee, 50, nov(2), nov(20), pm);
		changePending.setStatus(AllocationStatus.CHANGE_PENDING);
		allocationRepository.saveAndFlush(changePending);
		Project otherProject = projectRepository
			.save(new Project("Other project", "Client", null, nov(1), nov(30), pm));
		StaffingRequest elsewhere = requestRepository
			.save(new StaffingRequest(otherProject, "Java Developer", Seniority.MEDIOR, 60, nov(1), nov(30), 1));
		allocationRepository.saveAndFlush(new Allocation(elsewhere, employee, 20, nov(2), nov(6), pm));

		assertThat(allocationRepository.findByRequestProjectIdAndStatusIn(request.getProject().getId(),
				AllocationStatus.ACTIVE_OR_PROPOSED))
			.containsExactlyInAnyOrder(proposed, approved, changePending);
	}

	private User newRm() {
		return userRepository
			.save(new User(UUID.randomUUID() + "@staffsync.local", "hash", "Team", "Manager", Role.RM));
	}

	private Page<Allocation> pending(User rm) {
		return allocationRepository.findByEmployeeManagerIdAndStatusIn(rm.getId(), AllocationStatus.AWAITING_DECISION,
				PageRequest.of(0, 20, Sort.by("createdAt", "id")));
	}

	private List<Allocation> overlapping(LocalDate from, LocalDate to, Long excludeId) {
		return allocationRepository.findOverlapping(employee.getId(), from, to, AllocationStatus.ACTIVE, excludeId);
	}

	private Allocation save(int percent, LocalDate start, LocalDate end, AllocationStatus status) {
		Allocation allocation = new Allocation(request, employee, percent, start, end, pm);
		allocation.setStatus(status);
		return allocationRepository.saveAndFlush(allocation);
	}

	private Allocation approvedFor(User user, int percent, LocalDate start, LocalDate end) {
		Allocation allocation = new Allocation(request, user, percent, start, end, pm);
		allocation.setStatus(AllocationStatus.APPROVED);
		return allocation;
	}

	private static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

}
