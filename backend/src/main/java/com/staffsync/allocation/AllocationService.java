package com.staffsync.allocation;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.staffsync.allocation.dto.AllocationChangeDto;
import com.staffsync.allocation.dto.AllocationDto;
import com.staffsync.allocation.dto.AllocationProposalDto;
import com.staffsync.allocation.dto.ChangeAllocationRequest;
import com.staffsync.allocation.dto.MissingSkill;
import com.staffsync.allocation.dto.PendingApprovalDto;
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
import com.staffsync.request.RequestSkill;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
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

	/** The shortest rejection comment (BR-6) or change reason (BR-15), without the surrounding spaces. */
	private static final int MIN_TEXT_LENGTH = 10;

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
	 * percent and period default to the request's, but the start never before today: nobody is staffed in the
	 * past. The checks run in this order: BR-4 (403), the request hasn't ended (409 REQUEST_ENDED), BR-3 (400),
	 * the start isn't before today (400 ALLOCATION_IN_PAST),
	 * the project and request are open (409, BR-9), the employee is eligible (400, BR-9), no overlap on the
	 * same request (409, BR-8). Going over capacity only adds a warning (BR-2): approval enforces it (BR-1).
	 */
	@Transactional
	public AllocationProposalDto propose(ProposeAllocationRequest body, AuthUser currentUser) {
		StaffingRequest request = requestRepository.findById(body.requestId())
			.orElseThrow(() -> new NotFoundException("Staffing request", body.requestId()));
		checkOwner(request.getProject(), currentUser, "propose employees for its requests");

		LocalDate today = LocalDate.now();
		if (request.getEndDate().isBefore(today)) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_ENDED",
					"The request ended on " + request.getEndDate() + ", so nobody can be proposed for it");
		}
		int percent = body.percent() != null ? body.percent() : request.getAllocationPercent();
		LocalDate startDate = body.startDate() != null ? body.startDate()
				: (request.getStartDate().isBefore(today) ? today : request.getStartDate());
		LocalDate endDate = body.endDate() != null ? body.endDate() : request.getEndDate();
		if (percent % 10 != 0) {
			throw validationError("percent", "Percent must be a multiple of 10");
		}
		checkPeriod(startDate, endDate, request);
		checkNotInPast(startDate);
		checkOpen(request, "proposals");

		User employee = userRepository.findById(body.employeeId())
			.orElseThrow(() -> new NotFoundException("Employee", body.employeeId()));
		checkEligible(employee, request);
		checkNoOverlap(request, employee, startDate, endDate, null);

		// Before saving, so the new allocation isn't counted in its own load
		List<String> warnings = capacityWarnings(employee.getId(), startDate, endDate, percent, null);
		// checkOwner has shown that the project's PM is the current user, so they are the proposer
		Allocation allocation = allocationRepository
			.save(new Allocation(request, employee, percent, startDate, endDate, request.getProject().getPm()));
		return new AllocationProposalDto(AllocationDto.from(allocation), warnings);
	}

	/**
	 * The RM approves a proposed allocation (§9: {@code PROPOSED → APPROVED}) or a pending change
	 * ({@code CHANGE_PENDING → APPROVED}, see {@link #approveChange}). For a proposal the checks run in this
	 * order: BR-5 (403), BR-7 (409), the request and project are still open (409), the employee is still
	 * active (409), the proposed start hasn't passed (409 ALLOCATION_START_PASSED: approving would staff someone
	 * in the past, so the PM proposes again from today), then the hard capacity check on every working day of
	 * the period (409 CAPACITY_EXCEEDED,
	 * BR-1). Nothing is changed before the last check passes, so a failed approval leaves the allocation
	 * {@code PROPOSED}. Then the request status is recalculated (BR-10).
	 */
	@Transactional
	public AllocationDto approve(Long id, AuthUser currentUser) {
		Allocation allocation = find(id);
		User rm = checkResourceManager(allocation, currentUser);
		checkPendingDecision(allocation);
		if (allocation.hasPendingChange()) {
			return approveChange(allocation, rm);
		}
		checkOpen(allocation.getRequest(), "approvals");
		checkEmployeeActive(allocation);
		checkStartNotPassed(allocation.getStartDate());
		// A PROPOSED allocation is not active, so it isn't counted in its own load
		capacityService.checkCapacity(allocation.getEmployee().getId(), allocation.getStartDate(),
				allocation.getEndDate(), allocation.getPercent(), null);

		allocation.setStatus(AllocationStatus.APPROVED);
		allocation.recordDecision(rm, null);
		requestStatusService.recalculate(allocation.getRequest().getId());
		return AllocationDto.from(allocation);
	}

	/**
	 * The RM approves a pending change (BR-15, §9: {@code CHANGE_PENDING → APPROVED} with the new values).
	 * After BR-5 and BR-7 in {@link #approve}: the project is still open (409), the employee is still active
	 * (409), a change that moves the start date isn't approved once the allocation has started (409
	 * ALLOCATION_ALREADY_STARTED, BR-15), then BR-1 for the new percent and period without this allocation's
	 * current values, which they replace (§7, the 60% → 70% example). The request isn't checked for being open: a change on a
	 * {@code FILLED} request is normal, because the allocation counts as active while it waits (BR-16, T-36).
	 * <p>
	 * T-30: on 409 CAPACITY_EXCEEDED (or ALLOCATION_ALREADY_STARTED) nothing changes, as for a proposal. The allocation stays
	 * {@code CHANGE_PENDING} with its current values in force, so the RM can still approve it once capacity
	 * frees up or reject it, and the PM can withdraw it. Otherwise the pending values are applied, the decision
	 * is recorded, and the request status is recalculated (BR-10), which keeps a {@code FILLED} request filled.
	 */
	private AllocationDto approveChange(Allocation allocation, User rm) {
		checkProjectOpen(allocation.getRequest().getProject(), "approvals");
		checkEmployeeActive(allocation);
		// T-32 again: the change may have been requested before the start and decided after it
		if (hasStarted(allocation) && !allocation.getPendingStartDate().equals(allocation.getStartDate())) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_ALREADY_STARTED",
					"Allocation has already started (on " + allocation.getStartDate()
							+ "), so a change that moves its start date can't be approved");
		}
		if (!allocation.getPendingStartDate().equals(allocation.getStartDate())) {
			checkStartNotPassed(allocation.getPendingStartDate());
		}
		capacityService.checkCapacity(allocation.getEmployee().getId(), allocation.getPendingStartDate(),
				allocation.getPendingEndDate(), allocation.getPendingPercent(), allocation.getId());

		allocation.applyPendingChange();
		allocation.recordDecision(rm, null);
		requestStatusService.recalculate(allocation.getRequest().getId());
		return AllocationDto.from(allocation);
	}

	/**
	 * The RM rejects a proposed allocation (§9: {@code PROPOSED → REJECTED}) or a pending change
	 * ({@code CHANGE_PENDING → APPROVED} with the current values, BR-15, T-34), with a comment of at least 10
	 * characters without the surrounding spaces (BR-6, 400). Then BR-5 (403) and BR-7 (409), as for approve.
	 * The request status doesn't change: a proposal was never active, and a rejected change leaves the
	 * allocation active with the values it had (BR-10, BR-16).
	 */
	@Transactional
	public AllocationDto reject(Long id, RejectAllocationRequest body, AuthUser currentUser) {
		String comment = requireText(body.comment(), "comment", "Comment");
		Allocation allocation = find(id);
		User rm = checkResourceManager(allocation, currentUser);
		checkPendingDecision(allocation);

		if (allocation.hasPendingChange()) {
			allocation.clearPendingChange();
		}
		else {
			allocation.setStatus(AllocationStatus.REJECTED);
		}
		allocation.recordDecision(rm, comment);
		return AllocationDto.from(allocation);
	}

	/**
	 * The PM withdraws a proposal or cancels an approved allocation before it starts (§9:
	 * {@code PROPOSED → CANCELLED}, {@code APPROVED → CANCELLED}). The checks run in this order: BR-4 (403),
	 * the project is still open (409), the allocation is {@code PROPOSED} or {@code APPROVED} (409), an
	 * approved one hasn't started yet (409). Then the request status is recalculated (BR-10), so a
	 * {@code FILLED} request goes back to {@code PARTIALLY_FILLED} (T-20). A withdrawn proposal was never
	 * active, so its request keeps its status.
	 */
	@Transactional
	public AllocationDto cancel(Long id, AuthUser currentUser) {
		Allocation allocation = find(id);
		Project project = allocation.getRequest().getProject();
		checkOwner(project, currentUser, "cancel its allocations");
		// Otherwise the recalculation could reopen a request on a closed project (BR-11)
		checkProjectOpen(project, "cancellations");
		checkCancellable(allocation);

		allocation.setStatus(AllocationStatus.CANCELLED);
		requestStatusService.recalculate(allocation.getRequest().getId());
		return AllocationDto.from(allocation);
	}

	/**
	 * The PM asks to change the percent and/or the period of an approved allocation (BR-15, §9:
	 * {@code APPROVED → CHANGE_PENDING}). A value left out keeps its current one, but at least one must
	 * change. The checks run in this order: the reason has 10 characters without the surrounding spaces
	 * (400), BR-4 (403), the project is still open (409), the allocation is {@code APPROVED} (409, and
	 * {@code CHANGE_ALREADY_PENDING} when a change already waits, T-31) and hasn't ended, i.e. its
	 * {@code endDate} is not before today (409, T-33), the percent is a step of 10 and something changes
	 * (400), the start date stays the same once the allocation has started (400, T-32), a new start date isn't
	 * in the past (400 ALLOCATION_IN_PAST), BR-3 (400), and the
	 * new period doesn't overlap another allocation of the employee on the same request (409, BR-8).
	 * "Started" is the same as for {@link #cancel}: an allocation starts on its start date, so it has
	 * started once its {@code startDate} is today or earlier.
	 * <p>
	 * The current values stay in force until the RM decides (BR-16), so neither capacity nor the
	 * request status changes. Going over capacity with the new values only adds a warning (BR-2):
	 * approving the change enforces it (BR-1).
	 */
	@Transactional
	public AllocationChangeDto requestChange(Long id, ChangeAllocationRequest body, AuthUser currentUser) {
		String reason = requireText(body.reason(), "reason", "Reason");
		Allocation allocation = find(id);
		StaffingRequest request = allocation.getRequest();
		checkOwner(request.getProject(), currentUser, "request changes to its allocations");
		checkProjectOpen(request.getProject(), "change requests");
		checkChangeable(allocation);

		int percent = body.percent() != null ? body.percent() : allocation.getPercent();
		LocalDate startDate = body.startDate() != null ? body.startDate() : allocation.getStartDate();
		LocalDate endDate = body.endDate() != null ? body.endDate() : allocation.getEndDate();
		if (percent % 10 != 0) {
			throw validationError("percent", "Percent must be a multiple of 10");
		}
		if (percent == allocation.getPercent() && startDate.equals(allocation.getStartDate())
				&& endDate.equals(allocation.getEndDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "NO_CHANGE",
					"The change must give a different percent, start date or end date");
		}
		if (hasStarted(allocation) && !startDate.equals(allocation.getStartDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "ALLOCATION_ALREADY_STARTED",
					"Allocation has already started (on " + allocation.getStartDate()
							+ "), so its start date can't change");
		}
		checkPeriod(startDate, endDate, request);
		if (!startDate.equals(allocation.getStartDate())) {
			checkNotInPast(startDate);
		}
		checkNoOverlap(request, allocation.getEmployee(), startDate, endDate, allocation.getId());

		// Without this allocation's current values, which the new ones would replace
		List<String> warnings = capacityWarnings(allocation.getEmployee().getId(), startDate, endDate, percent,
				allocation.getId());
		allocation.requestChange(percent, startDate, endDate, reason);
		return new AllocationChangeDto(AllocationDto.from(allocation), warnings);
	}

	/**
	 * The PM withdraws the change waiting for the RM (BR-15, T-35, §9: {@code CHANGE_PENDING → APPROVED}).
	 * The allocation keeps its current values. The checks run in this order: BR-4 (403), a change is
	 * pending (409). Neither capacity nor the request status changes, because the allocation was active
	 * with these values all along (BR-16).
	 */
	@Transactional
	public AllocationDto withdrawChange(Long id, AuthUser currentUser) {
		Allocation allocation = find(id);
		checkOwner(allocation.getRequest().getProject(), currentUser, "withdraw changes to its allocations");
		if (!allocation.hasPendingChange()) {
			throw new BusinessException(HttpStatus.CONFLICT, "NO_PENDING_CHANGE",
					"There is no pending change to withdraw, the allocation is " + label(allocation.getStatus()));
		}

		allocation.clearPendingChange();
		return AllocationDto.from(allocation);
	}

	/**
	 * The allocation side of BR-11, when a project is completed or cancelled on {@code closingDate} (T-21).
	 * The project's status change (US-24) calls it in the same transaction and has already checked the PM.
	 * For every allocation on the project's requests:
	 * <ul>
	 * <li>{@code PROPOSED → CANCELLED} (§9)</li>
	 * <li>a pending change is voided: {@code CHANGE_PENDING → APPROVED} with the current values (BR-15), and
	 * then it is treated like any approved allocation</li>
	 * <li>an approved allocation that hasn't started by the closing date is cancelled, one that runs past it
	 * ends on it, and one that has already ended is left alone</li>
	 * </ul>
	 * Then the status of each request that had one of them is recalculated (BR-10), so a {@code FILLED}
	 * request that lost an allocation no longer counts it. Cancelling the open requests is up to the caller.
	 */
	@Transactional
	public void closeForProject(Long projectId, LocalDate closingDate) {
		List<Allocation> allocations = allocationRepository.findByRequestProjectIdAndStatusIn(projectId,
				AllocationStatus.ACTIVE_OR_PROPOSED);
		for (Allocation allocation : allocations) {
			if (allocation.getStatus() == AllocationStatus.PROPOSED) {
				allocation.setStatus(AllocationStatus.CANCELLED);
				continue;
			}
			if (allocation.hasPendingChange()) {
				allocation.clearPendingChange();
			}
			if (allocation.getStartDate().isAfter(closingDate)) {
				allocation.setStatus(AllocationStatus.CANCELLED);
			}
			else if (allocation.getEndDate().isAfter(closingDate)) {
				allocation.setEndDate(closingDate);
			}
		}
		allocations.stream()
			.map(allocation -> allocation.getRequest().getId())
			.distinct()
			.forEach(requestStatusService::recalculate);
	}

	/**
	 * Searches allocations, always within what the caller may see (§10, "filtered by role"): an EMPLOYEE
	 * their own, a PM those on their projects, an RM those of their team ({@code employee.manager_id}),
	 * an ADMIN all. The filters narrow that further, so a filter outside the caller's scope gives an empty
	 * page, not a 403. {@code from} and {@code to} keep the allocations whose period overlaps them.
	 */
	@Transactional(readOnly = true)
	public Page<AllocationDto> search(Set<AllocationStatus> statuses, Long employeeId, Long projectId, LocalDate from,
			LocalDate to, Pageable pageable, AuthUser currentUser) {
		if (from != null && to != null && from.isAfter(to)) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD", "From must not be after to");
		}
		Specification<Allocation> scope = roleScope(currentUser);
		Specification<Allocation> filters = (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (statuses != null && !statuses.isEmpty()) {
				predicates.add(root.get("status").in(statuses));
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
	 * The RM's pending approvals (US-14, §10): the allocations of their own team ({@code employee.manager_id},
	 * BR-5) that can still be decided, i.e. {@code PROPOSED} and {@code CHANGE_PENDING} (BR-7). Each one is
	 * marked {@code NEW} or {@code CHANGE}, and comes with a capacity preview: what approving it would do to the
	 * employee's load (BR-1), so the RM sees an overbooking before clicking Approve. Always the caller's team, so
	 * another role is a 403 here too, not an empty page, and no RM can list another team's.
	 * <p>
	 * The list is ordered by how long each item has waited, oldest first: a change counts from when it was
	 * requested, not from when the allocation was first proposed. A team has a few dozen items at most, so they
	 * are sorted here and then cut into the page. {@code sort=createdAt,desc} reverses the order.
	 */
	@Transactional(readOnly = true)
	public Page<PendingApprovalDto> pending(Pageable pageable, AuthUser currentUser) {
		if (currentUser.role() != Role.RM) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_RESOURCE_MANAGER",
					"Only a resource manager has pending approvals");
		}
		Sort.Order order = checkedSort(pageable).getSort().getOrderFor("createdAt");
		Comparator<Allocation> byWait = Comparator.comparing(Allocation::getAwaitingSince)
			.thenComparing(Allocation::getId);
		if (order != null && order.isDescending()) {
			byWait = byWait.reversed();
		}
		List<Allocation> all = allocationRepository
			.findByEmployeeManagerIdAndStatusIn(currentUser.id(), AllocationStatus.AWAITING_DECISION, Pageable.unpaged())
			.stream()
			.sorted(byWait)
			.toList();
		int from = (int) Math.min(pageable.getOffset(), all.size());
		int to = (int) Math.min((long) from + pageable.getPageSize(), all.size());
		List<PendingApprovalDto> content = all.subList(from, to).stream().map(this::toPending).toList();
		return new PageImpl<>(content, pageable, all.size());
	}

	/** The item with what approving it would mean for the employee's capacity, as checked by approve (BR-1). */
	private PendingApprovalDto toPending(Allocation allocation) {
		CapacityService.LoadPreview preview = allocation.hasPendingChange()
				? capacityService.preview(allocation.getEmployee().getId(), allocation.getPendingStartDate(),
						allocation.getPendingEndDate(), allocation.getPendingPercent(), allocation.getId())
				: capacityService.preview(allocation.getEmployee().getId(), allocation.getStartDate(),
						allocation.getEndDate(), allocation.getPercent(), null);
		return PendingApprovalDto.from(allocation, preview);
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

	/**
	 * BR-4: only the PM who owns the project proposes candidates for its requests, cancels its allocations
	 * and requests changes to them. {@code what} names the action in the message, e.g.
	 * {@code "cancel its allocations"}.
	 */
	private static void checkOwner(Project project, AuthUser currentUser, String what) {
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can " + what);
		}
	}

	/** Nobody is staffed in the past: a new or moved start date is today or later. */
	private static void checkNotInPast(LocalDate startDate) {
		if (startDate.isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "ALLOCATION_IN_PAST",
					"The allocation can't start in the past (before " + LocalDate.now() + ")");
		}
	}

	/** A start date that was in the future when it was proposed may have passed by the time the RM decides. */
	private static void checkStartNotPassed(LocalDate startDate) {
		if (startDate.isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_START_PASSED",
					"The proposed start (" + startDate + ") has passed, so approving it would staff someone in "
							+ "the past. Ask the project manager to propose it again from today");
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
	 * BR-8: the employee has no other proposed or active allocation on this request in an overlapping period.
	 * {@code excludeAllocationId} leaves out the allocation being changed (BR-15), {@code null} for a new one.
	 */
	private void checkNoOverlap(StaffingRequest request, User employee, LocalDate startDate, LocalDate endDate,
			Long excludeAllocationId) {
		if (allocationRepository.existsOverlappingOnRequest(request.getId(), employee.getId(), startDate, endDate,
				AllocationStatus.ACTIVE_OR_PROPOSED, excludeAllocationId)) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_OVERLAP",
					"This employee is already proposed or allocated on this request in an overlapping period");
		}
	}

	/**
	 * BR-9: only an {@code OPEN} or {@code PARTIALLY_FILLED} request takes proposals, and approvals too. A
	 * completed or cancelled project takes none either, even before BR-11 has cancelled its requests.
	 * {@code what} names the action in the message, e.g. {@code "proposals"}.
	 */
	private static void checkOpen(StaffingRequest request, String what) {
		checkProjectOpen(request.getProject(), what);
		if (request.getStatus() != RequestStatus.OPEN && request.getStatus() != RequestStatus.PARTIALLY_FILLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_NOT_OPEN",
					"Only an open or partially filled request takes " + what + ", but this one is "
							+ label(request.getStatus()));
		}
	}

	/**
	 * A completed or cancelled project takes no proposals, approvals or cancellations (409). {@code what}
	 * names the action in the message, e.g. {@code "cancellations"}.
	 */
	private static void checkProjectOpen(Project project, String what) {
		if (project.getStatus().isClosed()) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_CLOSED",
					"A " + label(project.getStatus()) + " project takes no " + what);
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

	/** BR-7: only a {@code PROPOSED} allocation or a pending change ({@code CHANGE_PENDING}, BR-15) is decided. */
	private static void checkPendingDecision(Allocation allocation) {
		if (allocation.getStatus() != AllocationStatus.PROPOSED && !allocation.hasPendingChange()) {
			throw new BusinessException(HttpStatus.CONFLICT, "INVALID_ALLOCATION_STATUS",
					"Only a proposed allocation or a pending change can be approved or rejected, but this one is "
							+ label(allocation.getStatus()));
		}
	}

	/**
	 * §9: only a {@code PROPOSED} or {@code APPROVED} allocation can be cancelled. A {@code CHANGE_PENDING}
	 * one isn't: its pending change is withdrawn first (US-13, BR-15). An approved allocation can only be
	 * cancelled "before it starts", and it starts on its start date, so its {@code startDate} must be after
	 * today. A proposal can always be withdrawn, because it never took any capacity.
	 */
	private static void checkCancellable(Allocation allocation) {
		AllocationStatus status = allocation.getStatus();
		if (status != AllocationStatus.PROPOSED && status != AllocationStatus.APPROVED) {
			throw new BusinessException(HttpStatus.CONFLICT, "INVALID_ALLOCATION_STATUS",
					"Only a proposed or approved allocation can be cancelled, but this one is "
							+ label(status));
		}
		if (status == AllocationStatus.APPROVED && hasStarted(allocation)) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_ALREADY_STARTED",
					"Allocation has already started (on " + allocation.getStartDate() + "), so it can't be cancelled");
		}
	}

	/**
	 * BR-15: only an {@code APPROVED} allocation that hasn't ended can be changed (T-33), and only one change
	 * waits at a time (T-31). It has ended once its {@code endDate} is before today: the end date is still a
	 * working day of it.
	 */
	private static void checkChangeable(Allocation allocation) {
		if (allocation.hasPendingChange()) {
			throw new BusinessException(HttpStatus.CONFLICT, "CHANGE_ALREADY_PENDING",
					"A change to this allocation is already waiting for the resource manager");
		}
		if (allocation.getStatus() != AllocationStatus.APPROVED) {
			throw new BusinessException(HttpStatus.CONFLICT, "INVALID_ALLOCATION_STATUS",
					"Only an approved allocation can be changed, but this one is " + label(allocation.getStatus()));
		}
		if (allocation.getEndDate().isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.CONFLICT, "ALLOCATION_ENDED",
					"Allocation ended on " + allocation.getEndDate() + ", so it can't be changed");
		}
	}

	/**
	 * An allocation starts on its start date, so it has started once that is today or earlier. Cancel (US-12)
	 * and change requests (BR-15) both use this, so they agree on what "started" means.
	 */
	private static boolean hasStarted(Allocation allocation) {
		return !allocation.getStartDate().isAfter(LocalDate.now());
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
	 * {@code excludeAllocationId} leaves out the allocation being changed (BR-15), {@code null} for a new one.
	 */
	private List<String> capacityWarnings(Long employeeId, LocalDate from, LocalDate to, int percent,
			Long excludeAllocationId) {
		return CapacityService
			.toRuns(capacityService.findOverloadedDays(employeeId, from, to, percent, excludeAllocationId, true))
			.stream()
			.map(run -> "Capacity would be exceeded on " + run.days() + " (" + run.load() + "%)")
			.toList();
	}

	/**
	 * A rejection comment (BR-6) or change reason (BR-15), trimmed. Bean Validation counts the spaces too, so
	 * {@code "  Too short "} passes it and is only caught here, as a 400 on {@code field}.
	 */
	private static String requireText(String value, String field, String name) {
		String text = value.trim();
		if (text.length() < MIN_TEXT_LENGTH) {
			throw validationError(field, name + " must be between 10 and 1000 characters");
		}
		return text;
	}

	/** The same body as a Bean Validation failure, so a form can show the message next to the field. */
	private static BusinessException validationError(String field, String message) {
		return new BusinessException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR,
				"Some fields are invalid", List.of(new FieldViolation(field, message)));
	}

	/** A status as the messages write it: {@code CHANGE_PENDING} → {@code "change pending"}. */
	private static String label(Enum<?> status) {
		return status.name().toLowerCase().replace('_', ' ');
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
