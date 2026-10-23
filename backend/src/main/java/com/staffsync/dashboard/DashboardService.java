package com.staffsync.dashboard;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.dashboard.dto.DashboardCardDto;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.project.ProjectStatus;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Home page cards (§11, T-40): a few numbers for the caller's role only. The dataset is small, so the
 * queries stay simple: counts, and one {@link CapacityService} call per team member for the RM.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

	static final Set<RequestStatus> OPEN_REQUESTS = Set.of(RequestStatus.OPEN, RequestStatus.PARTIALLY_FILLED);

	private final AllocationRepository allocationRepository;

	private final ProjectRepository projectRepository;

	private final StaffingRequestRepository requestRepository;

	private final UserRepository userRepository;

	private final SkillRepository skillRepository;

	private final CapacityService capacityService;

	public DashboardService(AllocationRepository allocationRepository, ProjectRepository projectRepository,
			StaffingRequestRepository requestRepository, UserRepository userRepository,
			SkillRepository skillRepository, CapacityService capacityService) {
		this.allocationRepository = allocationRepository;
		this.projectRepository = projectRepository;
		this.requestRepository = requestRepository;
		this.userRepository = userRepository;
		this.skillRepository = skillRepository;
		this.capacityService = capacityService;
	}

	public List<DashboardCardDto> cards(AuthUser currentUser) {
		return cards(currentUser, LocalDate.now());
	}

	/**
	 * The cards as of {@code today}. A switch expression, so a new role doesn't compile until it has cards.
	 * Loads are per working day (§7), so on a weekend "today" is the next Monday.
	 */
	List<DashboardCardDto> cards(AuthUser currentUser, LocalDate today) {
		LocalDate day = CapacityService.workingDayFrom(today);
		Long me = currentUser.id();
		return switch (currentUser.role()) {
			case EMPLOYEE -> employeeCards(me, day);
			case PM -> pmCards(me);
			case RM -> rmCards(me, day);
			case ADMIN -> adminCards();
		};
	}

	/** Today's total load, the projects the employee works on today, and the next allocation to start. */
	private List<DashboardCardDto> employeeCards(Long me, LocalDate day) {
		int load = capacityService.getDailyLoad(me, day, day, null).getOrDefault(day, 0);
		long projects = allocationRepository.findOverlapping(me, day, day, AllocationStatus.ACTIVE, null)
			.stream()
			.map(allocation -> allocation.getRequest().getProject().getId())
			.distinct()
			.count();
		Specification<Allocation> upcoming = (root, query, cb) -> cb.and(
				cb.equal(root.get("employee").get("id"), me), root.get("status").in(AllocationStatus.ACTIVE),
				cb.greaterThan(root.get("startDate"), day));
		Allocation next = allocationRepository
			.findAll(upcoming, PageRequest.of(0, 1, Sort.by("startDate").and(Sort.by("id"))))
			.stream()
			.findFirst()
			.orElse(null);

		return List.of(DashboardCardDto.of("currentLoad", "Current load", load + "%", "/my-allocations"),
				DashboardCardDto.of("activeProjects", "Active projects", String.valueOf(projects), "/my-allocations"),
				next == null ? DashboardCardDto.of("nextAllocation", "Next allocation", "None", "/my-allocations")
						: new DashboardCardDto("nextAllocation", "Next allocation",
								next.getRequest().getProject().getName(), next.getStartDate(), "/my-allocations"));
	}

	/** Across all of the PM's projects, except the first card, which counts the ACTIVE ones. */
	private List<DashboardCardDto> pmCards(Long me) {
		long activeProjects = projectRepository.count(projectsOf(me).and(activeProject()));
		long openRequests = requestRepository.countByProjectPmIdAndStatusIn(me, OPEN_REQUESTS);
		long awaitingRm = allocationRepository.count((root, query, cb) -> cb.and(
				cb.equal(root.get("request").get("project").get("pm").get("id"), me),
				root.get("status").in(AllocationStatus.AWAITING_DECISION)));

		return List.of(DashboardCardDto.of("activeProjects", "Active projects", String.valueOf(activeProjects),
				"/projects"),
				DashboardCardDto.of("openRequests", "Open requests", String.valueOf(openRequests), "/projects"),
				DashboardCardDto.of("awaitingRm", "Waiting for an RM", String.valueOf(awaitingRm), "/projects"));
	}

	/**
	 * The team is the RM's active users ({@code manager_id}, BR-5). A member is on the bench when their load is
	 * 0% on every working day of this week; the average is the plain mean of today's load %.
	 */
	private List<DashboardCardDto> rmCards(Long me, LocalDate day) {
		long pending = allocationRepository.count((root, query, cb) -> cb.and(
				cb.equal(root.get("employee").get("manager").get("id"), me),
				root.get("status").in(AllocationStatus.AWAITING_DECISION)));

		LocalDate monday = day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		LocalDate friday = monday.plusDays(4);
		List<User> team = userRepository.findByManagerIdAndActiveTrue(me);
		int onBench = 0;
		int loadToday = 0;
		for (User member : team) {
			Map<LocalDate, Integer> week = capacityService.getDailyLoad(member.getId(), monday, friday, null);
			if (allZero(week.values())) {
				onBench++;
			}
			loadToday += week.getOrDefault(day, 0);
		}
		long average = team.isEmpty() ? 0 : Math.round((double) loadToday / team.size());

		return List.of(DashboardCardDto.of("pendingDecisions", "Decisions waiting for me", String.valueOf(pending),
				"/approvals"),
				DashboardCardDto.of("benchThisWeek", "On the bench this week", String.valueOf(onBench), "/team"),
				DashboardCardDto.of("averageLoad", "Average team load", average + "%", "/team"));
	}

	/** Admin has no projects page, so that card has no link. */
	private List<DashboardCardDto> adminCards() {
		return List.of(
				DashboardCardDto.of("activeUsers", "Active users", String.valueOf(userRepository.countByActiveTrue()),
						"/admin/users"),
				DashboardCardDto.of("activeProjects", "Active projects",
						String.valueOf(projectRepository.count(activeProject())), null),
				DashboardCardDto.of("skills", "Skills in the catalog", String.valueOf(skillRepository.count()),
						"/admin/skills"));
	}

	private static Specification<Project> projectsOf(Long pmId) {
		return (root, query, cb) -> cb.equal(root.get("pm").get("id"), pmId);
	}

	private static Specification<Project> activeProject() {
		return (root, query, cb) -> cb.equal(root.get("status"), ProjectStatus.ACTIVE);
	}

	private static boolean allZero(Collection<Integer> loads) {
		return loads.stream().allMatch(load -> load == 0);
	}

}
