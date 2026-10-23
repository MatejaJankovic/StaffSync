package com.staffsync.allocation;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.staffsync.allocation.dto.AllocationDto;
import com.staffsync.allocation.dto.AllocationProposalDto;
import com.staffsync.allocation.dto.MissingSkill;
import com.staffsync.allocation.dto.ProposeAllocationRequest;
import com.staffsync.allocation.dto.RejectAllocationRequest;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.ErrorResponse.FieldViolation;
import com.staffsync.common.GlobalExceptionHandler;
import com.staffsync.common.NotFoundException;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectStatus;
import com.staffsync.request.RequestSkill;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AllocationService {

	/** The properties a list can be sorted by. Anything else is a 400, not a 500 from the query. */
	private static final Set<String> SORTABLE = Set.of("id", "percent", "startDate", "endDate", "status",
			"createdAt");

	private final AllocationRepository allocationRepository;

	private final StaffingRequestRepository requestRepository;

	private final UserRepository userRepository;

	private final EmployeeSkillRepository employeeSkillRepository;

	private final CapacityService capacityService;

	private final RequestStatusService requestStatusService;

	public AllocationService(AllocationRepository allocationRepository, StaffingRequestRepository requestRepository,
			UserRepository userRepository, EmployeeSkillRepository employeeSkillRepository,
			CapacityService capacityService, RequestStatusService requestStatusService) {
		this.allocationRepository = allocationRepository;
		this.requestRepository = requestRepository;
		this.userRepository = userRepository;
		this.employeeSkillRepository = employeeSkillRepository;
		this.capacityService = capacityService;
		this.requestStatusService = requestStatusService;
	}

	/**
	 * Proposes an employee for a staffing request: the allocation starts {@code PROPOSED} (§9), and the
	 * percent and period default to the request's. The checks run in this order: BR-4 (403), BR-3 (400),
	 * the project and request are open (409, BR-9), the employee is eligible (400, BR-9), no overlap on the
	 * same request (409, BR-8). Going over capacity only adds a warning (BR-2): approval enforces it (BR-1).
	 */
	@Transactional
	public AllocationProposalDto propose(ProposeAllocationRequest body, AuthUser currentUser) {
		StaffingRequest request = requestRepository.findById(body.requestId())
			.orElseThrow(() -> new NotFoundException("Staffing request", body.requestId()));
		checkOwner(request.getProject(), currentUser);

		int percent = body.percent() != null ? body.percent() : request.getAllocationPercent();
		LocalDate startDate = body.startDate() != null ? body.startDate() : request.getStartDate();
		LocalDate endDate = body.endDate() != null ? body.endDate() : request.getEndDate();
		if (percent % 10 != 0) {
			throw validationError("percent", "Percent must be a multiple of 10");
		}
		checkPeriod(startDate, endDate, request);
		checkOpen(request, "proposals");

		User employee = userRepository.findById(body.employeeId())
			.orElseThrow(() -> new NotFoundException("Employee", body.employeeId()));
		checkEligible(employee, request);
		if (allocationRepository.existsOverlappingOnRequest(request.getId(), employee.getId(), startDate, endDate,
				AllocationStatus.ACTIVE_OR_PROPOSED)) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_OVERLAP",
					"This employee is already proposed or allocated on this request in an overlapping period");
		}

		// Before saving, so the new allocation isn't counted in its own load
		List<String> warnings = capacityWarnings(employee.getId(), startDate, endDate, percent);
		// checkOwner has shown that the project's PM is the current user, so they are the proposer
		Allocation allocation = allocationRepository
			.save(new Allocation(request, employee, percent, startDate, endDate, request.getProject().getPm()));
		return new AllocationProposalDto(AllocationDto.from(allocation), warnings);
	}

	/**
	 * The RM approves a proposed allocation (§9: {@code PROPOSED → APPROVED}). The checks run in this order:
	 * BR-5 (403), BR-7 (409), the request and project are still open (409), the employee is still active
	 * (409), then the hard capacity check on every working day of the period (409 CAPACITY_EXCEEDED, BR-1).
	 * Nothing is changed before the last check passes, so a failed approval leaves the allocation
	 * {@code PROPOSED}. Then the request status is recalculated (BR-10).
	 */
	@Transactional
	public AllocationDto approve(Long id, AuthUser currentUser) {
		Allocation allocation = find(id);
		User rm = checkResourceManager(allocation, currentUser);
		checkPendingDecision(allocation);
		checkOpen(allocation.getRequest(), "approvals");
		checkEmployeeActive(allocation);
		// A PROPOSED allocation is not active, so it isn't counted in its own load
		capacityService.checkCapacity(allocation.getEmployee().getId(), allocation.getStartDate(),
				allocation.getEndDate(), allocation.getPercent(), null);

		allocation.setStatus(AllocationStatus.APPROVED);
		allocation.recordDecision(rm, null);
		requestStatusService.recalculate(allocation.getRequest().getId());
		return AllocationDto.from(allocation);
	}

	/**
	 * The RM rejects a proposed allocation (§9: {@code PROPOSED → REJECTED}) with a comment of at least 10
	 * characters without the surrounding spaces (BR-6, 400). Then BR-5 (403) and BR-7 (409), as for approve.
	 * The request status doesn't change, because a proposal was never active (BR-10).
	 */
	@Transactional
	public AllocationDto reject(Long id, RejectAllocationRequest body, AuthUser currentUser) {
		// Bean Validation counts the spaces too, so "  Too short " would pass it
		String comment = body.comment().trim();
		if (comment.length() < 10) {
			throw validationError("comment", "Comment must be between 10 and 1000 characters");
		}
		Allocation allocation = find(id);
		User rm = checkResourceManager(allocation, currentUser);
		checkPendingDecision(allocation);

		allocation.setStatus(AllocationStatus.REJECTED);
		allocation.recordDecision(rm, comment);
		return AllocationDto.from(allocation);
	}

	/**
	 * Searches allocations, always within what the caller may see (§10, "filtered by role"): an EMPLOYEE
	 * their own, a PM those on their projects, an RM those of their team ({@code employee.manager_id}),
	 * an ADMIN all. The filters narrow that further, so a filter outside the caller's scope gives an empty
	 * page, not a 403. {@code from} and {@code to} keep the allocations whose period overlaps them.
	 */
	@Transactional(readOnly = true)
	public Page<AllocationDto> search(AllocationStatus status, Long employeeId, Long projectId, LocalDate from,
			LocalDate to, Pageable pageable, AuthUser currentUser) {
		if (from != null && to != null && from.isAfter(to)) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD", "From must not be after to");
		}
		Specification<Allocation> scope = roleScope(currentUser);
		Specification<Allocation> filters = (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (status != null) {
				predicates.add(cb.equal(root.get("status"), status));
			}
			if (employeeId != null) {
				predicates.add(cb.equal(root.get("employee").get("id"), employeeId));
			}
			if (projectId != null) {
				predicates.add(cb.equal(root.get("request").get("project").get("id"), projectId));
			}
			if (from != null) {
				predicates.add(cb.greaterThanOrEqualTo(root.get("endDate"), from));
			}
			if (to != null) {
				predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), to));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
		return allocationRepository.findAll(scope.and(filters), checkedSort(pageable)).map(AllocationDto::from);
	}

	/**
	 * What each role may see (§10). A switch expression, so a new role doesn't compile until it has a
	 * scope here, and it runs before the query, so a principal without a role fails instead of seeing all.
	 */
	private static Specification<Allocation> roleScope(AuthUser currentUser) {
		Long me = currentUser.id();
		return switch (currentUser.role()) {
			case EMPLOYEE -> (root, query, cb) -> cb.equal(root.get("employee").get("id"), me);
			case PM -> (root, query, cb) -> cb.equal(root.get("request").get("project").get("pm").get("id"), me);
			case RM -> (root, query, cb) -> cb.equal(root.get("employee").get("manager").get("id"), me);
			case ADMIN -> (root, query, cb) -> cb.conjunction();
		};
	}

	/** BR-4: only the PM who owns the request's project proposes candidates for it. */
	private static void checkOwner(Project project, AuthUser currentUser) {
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can propose employees for its requests");
		}
	}

	/** BR-3: {@code startDate ≤ endDate}, and the period is inside the request's. */
	private static void checkPeriod(LocalDate startDate, LocalDate endDate, StaffingRequest request) {
		if (startDate.isAfter(endDate)) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD",
					"Start date must not be after end date");
		}
		if (startDate.isBefore(request.getStartDate()) || endDate.isAfter(request.getEndDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "ALLOCATION_OUTSIDE_REQUEST",
					"The allocation period must be inside the request period (" + request.getStartDate() + " to "
							+ request.getEndDate() + ")");
		}
	}

	/**
	 * BR-9: only an {@code OPEN} or {@code PARTIALLY_FILLED} request takes proposals, and approvals too. A
	 * completed or cancelled project takes none either, even before BR-11 has cancelled its requests.
	 * {@code what} names the action in the message, e.g. {@code "proposals"}.
	 */
	private static void checkOpen(StaffingRequest request, String what) {
		Project project = request.getProject();
		if (project.getStatus() == ProjectStatus.COMPLETED || project.getStatus() == ProjectStatus.CANCELLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_CLOSED",
					"A " + project.getStatus().name().toLowerCase() + " project takes no " + what);
		}
		if (request.getStatus() != RequestStatus.OPEN && request.getStatus() != RequestStatus.PARTIALLY_FILLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_NOT_OPEN",
					"Only an open or partially filled request takes " + what + ", but this one is "
							+ request.getStatus().name().toLowerCase().replace('_', ' '));
		}
	}

	/**
	 * BR-5: only the employee's own RM ({@code employee.manager_id}) decides on their allocations. Returns
	 * that RM, who is recorded as {@code decidedBy}.
	 */
	private static User checkResourceManager(Allocation allocation, AuthUser currentUser) {
		User manager = allocation.getEmployee().getManager();
		if (currentUser.role() != Role.RM || manager == null || !manager.getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_RESOURCE_MANAGER",
					"Only the employee's resource manager can approve or reject their allocations");
		}
		return manager;
	}

	/** BR-7: only a {@code PROPOSED} allocation is decided here. {@code CHANGE_PENDING} joins in US-13 (BR-15). */
	private static void checkPendingDecision(Allocation allocation) {
		if (allocation.getStatus() != AllocationStatus.PROPOSED) {
			throw new BusinessException(HttpStatus.CONFLICT, "INVALID_ALLOCATION_STATUS",
					"Only a proposed allocation can be approved or rejected, but this one is "
							+ allocation.getStatus().name().toLowerCase().replace('_', ' '));
		}
	}

	/**
	 * BR-12: deactivation only checks active allocations, so a proposal can outlive its employee. Approving it
	 * would give a deactivated user an active allocation. Rejecting it is still allowed, to clear it.
	 */
	private static void checkEmployeeActive(Allocation allocation) {
		if (!allocation.getEmployee().isActive()) {
			throw new BusinessException(HttpStatus.CONFLICT, "EMPLOYEE_INACTIVE",
					"A deactivated employee can't be allocated");
		}
	}

	private Allocation find(Long id) {
		return allocationRepository.findById(id).orElseThrow(() -> new NotFoundException("Allocation", id));
	}

	/** BR-9: an active user with the EMPLOYEE role, who has every mandatory skill at its minimum level or above. */
	private void checkEligible(User employee, StaffingRequest request) {
		if (!employee.isActive() || employee.getRole() != Role.EMPLOYEE) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "EMPLOYEE_NOT_ELIGIBLE",
					"Only an active user with the EMPLOYEE role can be proposed");
		}
		Map<Long, Integer> levels = employeeSkillRepository
			.findByUserIdOrderBySkillCategoryAscSkillNameAsc(employee.getId())
			.stream()
			.collect(Collectors.toMap(skill -> skill.getSkill().getId(), EmployeeSkill::getLevel));

		List<MissingSkill> missing = new ArrayList<>();
		for (RequestSkill required : request.getSkills()) {
			Integer level = levels.get(required.getSkill().getId());
			if (required.isMandatory() && (level == null || level < required.getMinLevel())) {
				missing.add(new MissingSkill(required.getSkill().getId(), required.getSkill().getName(),
						required.getMinLevel(), level));
			}
		}
		if (!missing.isEmpty()) {
			String names = missing.stream()
				.map(skill -> skill.skillName() + " (level " + skill.minLevel() + " or more)")
				.collect(Collectors.joining(", "));
			throw new BusinessException(HttpStatus.BAD_REQUEST, "MISSING_MANDATORY_SKILLS",
					"The employee doesn't have every required skill: " + names, missing);
		}
	}

	/**
	 * BR-2 soft booking: the days on which active + {@code PROPOSED} allocations + this one go over the
	 * employee's capacity, as one warning per run of consecutive working days with the same total, e.g.
	 * {@code "Capacity would be exceeded on 2026-11-02 – 2026-11-13 (120%)"}. A weekend doesn't break a run.
	 */
	private List<String> capacityWarnings(Long employeeId, LocalDate from, LocalDate to, int percent) {
		return CapacityService.toRuns(capacityService.findOverloadedDays(employeeId, from, to, percent, null, true))
			.stream()
			.map(run -> "Capacity would be exceeded on " + run.days() + " (" + run.load() + "%)")
			.toList();
	}

	/** The same body as a Bean Validation failure, so a form can show the message next to the field. */
	private static BusinessException validationError(String field, String message) {
		return new BusinessException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR,
				"Some fields are invalid", List.of(new FieldViolation(field, message)));
	}

	/** Rejects unknown sort properties, and adds the id as the last sort key so pages don't shuffle on ties. */
	private static Pageable checkedSort(Pageable pageable) {
		Sort sort = pageable.getSort();
		for (Sort.Order order : sort) {
			if (!SORTABLE.contains(order.getProperty())) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_SORT",
						"Can't sort by '" + order.getProperty() + "'. Sort by one of: "
								+ String.join(", ", SORTABLE.stream().sorted().toList()));
			}
		}
		if (sort.getOrderFor("id") == null) {
			sort = sort.and(Sort.by("id"));
		}
		return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
	}

}
