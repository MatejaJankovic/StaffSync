package com.staffsync.matching;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;

import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.matching.dto.CandidateDto;
import com.staffsync.project.Project;
import com.staffsync.request.RequestSkill;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * §8: ranks the employees who could fill a staffing request. Step 1 filters, step 2 scores skills (50),
 * availability (40) and seniority (10), and step 3 explains the score in {@code reasons} and
 * {@code warnings}. It depends only on {@link CapacityService} and repositories, so it is unit tested
 * with mocks.
 * <p>
 * Each component is rounded to a whole number and the score is the sum of the rounded components, so
 * the breakdown always adds up to the score (§8: 23 + 34 + 10 = 67, from 23.33 + 33.85 + 10).
 */
@Service
@Transactional(readOnly = true)
public class MatchingService {

	static final int SKILLS_WEIGHT = 50;

	static final int AVAILABILITY_WEIGHT = 40;

	static final int SENIORITY_SAME = 10;

	static final int SENIORITY_ADJACENT = 5;

	private static final int MAX_LEVEL = 5;

	private final StaffingRequestRepository requestRepository;

	private final UserRepository userRepository;

	private final EmployeeSkillRepository employeeSkillRepository;

	private final AllocationRepository allocationRepository;

	private final CapacityService capacityService;

	public MatchingService(StaffingRequestRepository requestRepository, UserRepository userRepository,
			EmployeeSkillRepository employeeSkillRepository, AllocationRepository allocationRepository,
			CapacityService capacityService) {
		this.requestRepository = requestRepository;
		this.userRepository = userRepository;
		this.employeeSkillRepository = employeeSkillRepository;
		this.allocationRepository = allocationRepository;
		this.capacityService = capacityService;
	}

	/**
	 * One page of the ranked candidates of a request. BR-4: only the PM who owns the request's project.
	 * BR-9: only for an open or partially filled request that hasn't ended, the only ones that take a proposal.
	 * The order is always by score, so the page's own sort is ignored.
	 */
	public Page<CandidateDto> getCandidates(Long requestId, AuthUser currentUser, Pageable pageable) {
		StaffingRequest request = requestRepository.findById(requestId)
			.orElseThrow(() -> new NotFoundException("Staffing request", requestId));
		checkOwner(request.getProject(), currentUser);
		checkOpen(request);
		if (request.getEndDate().isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_ENDED",
					"The request ended on " + request.getEndDate() + ", so nobody can be proposed for it");
		}

		List<CandidateDto> ranked = rank(request);
		int from = (int) Math.min(pageable.getOffset(), ranked.size());
		int to = (int) Math.min((long) from + pageable.getPageSize(), ranked.size());
		return new PageImpl<>(ranked.subList(from, to), pageable, ranked.size());
	}

	/**
	 * Every employee who passes the filter, best first. Ties go to the higher exact score, then the lower id.
	 * The whole ranking is computed on every call and then cut into a page. That is intended: there are about
	 * 30 employees (§12), and it keeps the order stable across pages.
	 */
	List<CandidateDto> rank(StaffingRequest request) {
		// Step 1: the filter. Whoever is already proposed or staffed on this request can't be a candidate again
		Set<Long> alreadyOnRequest = new HashSet<>(
				allocationRepository.findEmployeeIdsByRequestAndStatuses(request.getId(),
						AllocationStatus.ACTIVE_OR_PROPOSED));
		List<User> employees = userRepository.findByRoleAndActiveTrue(Role.EMPLOYEE)
			.stream()
			.filter(employee -> !alreadyOnRequest.contains(employee.getId()))
			.toList();
		if (employees.isEmpty()) {
			return List.of();
		}
		Map<Long, Map<Long, Integer>> levelsByEmployee = levelsByEmployee(employees);

		// Step 2 and 3: score the ones with every mandatory skill, and explain the score
		List<Scored> scored = new ArrayList<>();
		for (User employee : employees) {
			Map<Long, Integer> levels = levelsByEmployee.getOrDefault(employee.getId(), Map.of());
			if (hasEveryMandatorySkill(request, levels)) {
				scored.add(score(request, employee, levels));
			}
		}
		scored.sort(Comparator.comparingInt((Scored s) -> s.candidate().score())
			.reversed()
			.thenComparing(Comparator.comparingDouble(Scored::exactScore).reversed())
			.thenComparing(s -> s.candidate().employeeId()));
		return scored.stream().map(Scored::candidate).toList();
	}

	/** employee id → (skill id → level), for all the employees in one query. */
	private Map<Long, Map<Long, Integer>> levelsByEmployee(List<User> employees) {
		List<Long> ids = employees.stream().map(User::getId).toList();
		Map<Long, Map<Long, Integer>> levels = new HashMap<>();
		for (EmployeeSkill rating : employeeSkillRepository.findByUserIdIn(ids)) {
			levels.computeIfAbsent(rating.getUser().getId(), id -> new HashMap<>())
				.put(rating.getSkill().getId(), rating.getLevel());
		}
		return levels;
	}

	private static boolean hasEveryMandatorySkill(StaffingRequest request, Map<Long, Integer> levels) {
		return request.getSkills()
			.stream()
			.filter(RequestSkill::isMandatory)
			.allMatch(wanted -> levels.getOrDefault(wanted.getSkill().getId(), 0) >= wanted.getMinLevel());
	}

	private Scored score(StaffingRequest request, User employee, Map<Long, Integer> levels) {
		List<String> reasons = new ArrayList<>();
		List<String> warnings = new ArrayList<>();

		// The warnings read capacity first, then skills, then seniority (§8)
		double availability = availabilityScore(request, employee, warnings);
		double skills = skillsScore(request.getSkills(), levels, reasons, warnings);
		double seniority = seniorityScore(request.getSeniority(), employee.getSeniority(), warnings);

		CandidateDto.Breakdown breakdown = new CandidateDto.Breakdown(round(skills), round(availability),
				round(seniority));
		int score = breakdown.skills() + breakdown.availability() + breakdown.seniority();
		CandidateDto candidate = new CandidateDto(employee.getId(),
				employee.getFirstName() + " " + employee.getLastName(), employee.getSeniority(),
				employee.getDepartment() == null ? null : employee.getDepartment().getName(), score, breakdown,
				reasons, warnings);
		return new Scored(candidate, skills + availability + seniority);
	}

	/**
	 * The average match of the requested skills × 50. A skill at its minimum level matches 0.7, each level above
	 * adds 0.1 up to 1.0, and a missing one, or one below the minimum, matches 0. A request that asks for no
	 * skills can't be missed, so everybody gets the full 50.
	 */
	private static double skillsScore(List<RequestSkill> requested, Map<Long, Integer> levels, List<String> reasons,
			List<String> warnings) {
		if (requested.isEmpty()) {
			return SKILLS_WEIGHT;
		}
		int tenths = 0;
		for (RequestSkill wanted : requested) {
			String name = wanted.getSkill().getName();
			String kind = wanted.isMandatory() ? "required" : "nice to have";
			Integer level = levels.get(wanted.getSkill().getId());
			if (level == null) {
				warnings.add("Missing " + name + " (" + kind + ")");
				continue;
			}
			String text = name + " " + level + "/" + MAX_LEVEL + " (" + kind + " ≥ " + wanted.getMinLevel() + ")";
			if (level < wanted.getMinLevel()) {
				warnings.add(text);
				continue;
			}
			reasons.add(text);
			tenths += Math.min(10, 7 + level - wanted.getMinLevel());
		}
		return SKILLS_WEIGHT * tenths / (10.0 * requested.size());
	}

	/**
	 * The share of the working days of the request on which the free capacity covers the requested percent,
	 * × 40, counted from today for a request that has already started, since nobody can be staffed in the past.
	 * A period without a working day has nothing to fall short on, so it scores in full.
	 * <p>
	 * One {@code CapacityService} call, so one query, per candidate: fine for the same reason as §7's day-by-day
	 * walk. The free capacity counts APPROVED and CHANGE_PENDING allocations only (§7), so an employee who is
	 * only PROPOSED elsewhere still shows as free. A soft-booking warning like BR-2's could be added later.
	 */
	private double availabilityScore(StaffingRequest request, User employee, List<String> warnings) {
		LocalDate today = LocalDate.now();
		LocalDate from = request.getStartDate().isBefore(today) ? today : request.getStartDate();
		if (from.isAfter(request.getEndDate())) {
			return AVAILABILITY_WEIGHT;
		}
		SortedMap<LocalDate, Integer> free = new TreeMap<>(
				capacityService.getFreeCapacity(employee.getId(), from, request.getEndDate()));
		if (free.isEmpty()) {
			return AVAILABILITY_WEIGHT;
		}
		int required = request.getAllocationPercent();
		long enough = free.values().stream().filter(percent -> percent >= required).count();
		warnings.addAll(insufficientCapacity(free, required));
		return AVAILABILITY_WEIGHT * (double) enough / free.size();
	}

	/**
	 * The runs of consecutive working days that fall short, e.g. {@code Insufficient capacity 2026-11-02 –
	 * 2026-11-13 (40% free, 60% required)}. A weekend inside a run doesn't split it, and neither does a day
	 * with the same free capacity, but a different free capacity starts a new run.
	 */
	private static List<String> insufficientCapacity(SortedMap<LocalDate, Integer> free, int required) {
		List<Run> runs = new ArrayList<>();
		Run open = null;
		for (Map.Entry<LocalDate, Integer> day : free.entrySet()) {
			if (day.getValue() >= required) {
				open = null;
				continue;
			}
			int shortOf = Math.max(day.getValue(), 0);
			if (open != null && open.free() == shortOf) {
				open = new Run(open.from(), day.getKey(), shortOf);
				runs.set(runs.size() - 1, open);
			}
			else {
				open = new Run(day.getKey(), day.getKey(), shortOf);
				runs.add(open);
			}
		}
		return runs.stream()
			.map(run -> "Insufficient capacity "
					+ (run.from().equals(run.to()) ? run.from() : run.from() + " – " + run.to()) + " (" + run.free()
					+ "% free, " + required + "% required)")
			.toList();
	}

	/** The same level scores 10, a neighbouring one 5, and anything else 0. */
	private static double seniorityScore(Seniority wanted, Seniority actual, List<String> warnings) {
		if (actual == null) {
			warnings.add("Seniority not set (" + wanted + " requested)");
			return 0;
		}
		// JUNIOR, MEDIOR and SENIOR are declared in that order
		int gap = Math.abs(wanted.ordinal() - actual.ordinal());
		if (gap != 0) {
			warnings.add("Seniority " + actual + " (" + wanted + " requested)");
		}
		return switch (gap) {
			case 0 -> SENIORITY_SAME;
			case 1 -> SENIORITY_ADJACENT;
			default -> 0;
		};
	}

	private static int round(double value) {
		return (int) Math.round(value);
	}

	/**
	 * BR-9: a cancelled or filled request takes no proposal, so ranking candidates for it would only lead to
	 * buttons that answer 409. Same code as proposing.
	 */
	private static void checkOpen(StaffingRequest request) {
		RequestStatus status = request.getStatus();
		if (status != RequestStatus.OPEN && status != RequestStatus.PARTIALLY_FILLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_NOT_OPEN",
					"Candidates are only ranked for an open or partially filled request, but this one is "
							+ status.name().toLowerCase().replace('_', ' '));
		}
	}

	/** BR-4. */
	private static void checkOwner(Project project, AuthUser currentUser) {
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can see the candidates of its staffing requests");
		}
	}

	/** The candidate with its unrounded score, which only breaks ties between equal rounded ones. */
	private record Scored(CandidateDto candidate, double exactScore) {

	}

	private record Run(LocalDate from, LocalDate to, int free) {

	}

}
