package com.staffsync.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.dashboard.dto.DashboardCardDto;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link DashboardService} (T-40). "Today" is Wednesday 4 Nov 2026, so this week is 2–6 Nov.
 */
@ExtendWith(MockitoExtension.class)
class DashboardServiceTests {

	static final Long ME = 1L;

	static final LocalDate TODAY = nov(4);

	@Mock
	AllocationRepository allocationRepository;

	@Mock
	ProjectRepository projectRepository;

	@Mock
	StaffingRequestRepository requestRepository;

	@Mock
	UserRepository userRepository;

	@Mock
	SkillRepository skillRepository;

	@Mock
	CapacityService capacityService;

	@InjectMocks
	DashboardService dashboardService;

	// ---- EMPLOYEE

	@Test
	void anEmployeeSeesTodaysLoadTheirProjectsAndTheNextAllocation() {
		Project alpha = project(10L, "Project Alpha");
		Project beta = project(11L, "Project Beta");
		when(capacityService.getDailyLoad(ME, TODAY, TODAY, null)).thenReturn(Map.of(TODAY, 90));
		// Two allocations on Alpha count as one project
		when(allocationRepository.findOverlapping(ME, TODAY, TODAY, AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(allocation(alpha, nov(2)), allocation(alpha, nov(2)), allocation(beta, nov(2))));
		givenUpcoming(List.of(allocation(project(12L, "Project Gamma"), nov(16))));

		assertThat(dashboardService.cards(user(Role.EMPLOYEE), TODAY)).containsExactly(
				DashboardCardDto.of("currentLoad", "Current load", "90%", "/my-allocations"),
				DashboardCardDto.of("activeProjects", "Active projects", "2", "/my-allocations"),
				new DashboardCardDto("nextAllocation", "Next allocation", "Project Gamma", nov(16),
						"/my-allocations"));
	}

	@Test
	void anEmployeeWithoutAnUpcomingAllocationSeesNone() {
		when(capacityService.getDailyLoad(ME, TODAY, TODAY, null)).thenReturn(Map.of(TODAY, 0));
		when(allocationRepository.findOverlapping(ME, TODAY, TODAY, AllocationStatus.ACTIVE, null))
			.thenReturn(List.of());
		givenUpcoming(List.of());

		assertThat(dashboardService.cards(user(Role.EMPLOYEE), TODAY)).containsExactly(
				DashboardCardDto.of("currentLoad", "Current load", "0%", "/my-allocations"),
				DashboardCardDto.of("activeProjects", "Active projects", "0", "/my-allocations"),
				DashboardCardDto.of("nextAllocation", "Next allocation", "None", "/my-allocations"));
	}

	@Test
	void onAWeekendTheLoadIsTheNextMondays() {
		LocalDate saturday = nov(7);
		LocalDate monday = nov(9);
		when(capacityService.getDailyLoad(ME, monday, monday, null)).thenReturn(Map.of(monday, 40));
		when(allocationRepository.findOverlapping(ME, monday, monday, AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(allocation(project(10L, "Project Alpha"), nov(2))));
		givenUpcoming(List.of());

		assertThat(dashboardService.cards(user(Role.EMPLOYEE), saturday)).first()
			.extracting(DashboardCardDto::value)
			.isEqualTo("40%");
	}

	// ---- PM

	@Test
	void aPmSeesActiveProjectsOpenRequestsAndWhatWaitsForAnRm() {
		when(projectRepository.count(ArgumentMatchers.<Specification<Project>>any())).thenReturn(2L);
		when(requestRepository.countByProjectPmIdAndStatusIn(ME, DashboardService.OPEN_REQUESTS)).thenReturn(3L);
		when(allocationRepository.count(ArgumentMatchers.<Specification<Allocation>>any())).thenReturn(1L);

		assertThat(dashboardService.cards(user(Role.PM), TODAY)).containsExactly(
				DashboardCardDto.of("activeProjects", "Active projects", "2", "/projects"),
				DashboardCardDto.of("openRequests", "Open requests", "3", "/projects"),
				DashboardCardDto.of("awaitingRm", "Waiting for an RM", "1", "/projects"));
	}

	// ---- RM

	@Test
	void anRmSeesPendingDecisionsTheBenchAndTheAverageLoad() {
		User free = member(21L);
		User mondayOnly = member(22L);
		User full = member(23L);
		when(allocationRepository.count(ArgumentMatchers.<Specification<Allocation>>any())).thenReturn(2L);
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of(free, mondayOnly, full));
		givenWeek(free, 0, 0, 0, 0, 0);
		givenWeek(mondayOnly, 50, 0, 0, 0, 0);
		givenWeek(full, 100, 100, 100, 100, 100);

		// Only "free" is at 0% all week; today's loads are 0, 0 and 100, so the average is 33.3 → 33%
		assertThat(dashboardService.cards(user(Role.RM), TODAY)).containsExactly(
				DashboardCardDto.of("pendingDecisions", "Decisions waiting for me", "2", "/approvals"),
				DashboardCardDto.of("benchThisWeek", "On the bench this week", "1", "/team"),
				DashboardCardDto.of("averageLoad", "Average team load", "33%", "/team"));
	}

	@Test
	void theAverageLoadIsRoundedHalfUp() {
		User a = member(21L);
		User b = member(22L);
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of(a, b));
		givenWeek(a, 50, 50, 50, 50, 50);
		givenWeek(b, 30, 30, 25, 30, 30);

		assertThat(dashboardService.cards(user(Role.RM), TODAY)).last()
			.extracting(DashboardCardDto::value)
			.isEqualTo("38%");
	}

	@Test
	void anRmWithoutATeamSeesZeros() {
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of());

		assertThat(dashboardService.cards(user(Role.RM), TODAY)).extracting(DashboardCardDto::value)
			.containsExactly("0", "0", "0%");
	}

	// ---- ADMIN

	@Test
	void anAdminSeesUsersProjectsAndSkillsAndTheProjectsCardHasNoLink() {
		when(userRepository.countByActiveTrue()).thenReturn(37L);
		when(projectRepository.count(ArgumentMatchers.<Specification<Project>>any())).thenReturn(5L);
		when(skillRepository.count()).thenReturn(25L);

		assertThat(dashboardService.cards(user(Role.ADMIN), TODAY)).containsExactly(
				DashboardCardDto.of("activeUsers", "Active users", "37", "/admin/users"),
				DashboardCardDto.of("activeProjects", "Active projects", "5", null),
				DashboardCardDto.of("skills", "Skills in the catalog", "25", "/admin/skills"));
	}

	// ---- helpers

	private void givenUpcoming(List<Allocation> allocations) {
		Page<Allocation> page = new PageImpl<>(allocations);
		when(allocationRepository.findAll(ArgumentMatchers.<Specification<Allocation>>any(), any(Pageable.class)))
			.thenReturn(page);
	}

	/** The member's load on Mon–Fri 2–6 Nov. */
	private void givenWeek(User member, int... loads) {
		Map<LocalDate, Integer> week = new LinkedHashMap<>();
		for (int i = 0; i < loads.length; i++) {
			week.put(nov(2 + i), loads[i]);
		}
		when(capacityService.getDailyLoad(eq(member.getId()), eq(nov(2)), eq(nov(6)), eq(null))).thenReturn(week);
	}

	private static AuthUser user(Role role) {
		return new AuthUser(ME, role.name().toLowerCase() + "@staffsync.local", role);
	}

	private static User member(Long id) {
		User user = new User("member" + id + "@staffsync.local", "hash", "Member", "Test", Role.EMPLOYEE);
		ReflectionTestUtils.setField(user, "id", id);
		return user;
	}

	private static Project project(Long id, String name) {
		Project project = new Project(name, "Acme", null, nov(1), LocalDate.of(2027, 3, 31), null);
		ReflectionTestUtils.setField(project, "id", id);
		return project;
	}

	private static Allocation allocation(Project project, LocalDate start) {
		StaffingRequest request = new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60, nov(1),
				LocalDate.of(2027, 1, 31), 2);
		Allocation allocation = new Allocation(request, null, 60, start, LocalDate.of(2027, 1, 31), null);
		allocation.setStatus(AllocationStatus.APPROVED);
		return allocation;
	}

	private static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

}
