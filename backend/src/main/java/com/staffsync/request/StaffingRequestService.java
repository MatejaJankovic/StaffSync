package com.staffsync.request;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.RequestStatusService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.ErrorResponse.FieldViolation;
import com.staffsync.common.GlobalExceptionHandler;
import com.staffsync.common.NotFoundException;
import com.staffsync.project.Project;
import com.staffsync.project.ProjectRepository;
import com.staffsync.request.dto.RequestSkillRequest;
import com.staffsync.request.dto.StaffingRequestDto;
import com.staffsync.request.dto.StaffingRequestRequest;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffingRequestService {

	/** The properties a list can be sorted by. Anything else is a 400, not a 500 from the query. */
	private static final Set<String> SORTABLE = Set.of("id", "title", "seniority", "allocationPercent", "startDate",
			"endDate", "headcount", "status", "createdAt");

	private final StaffingRequestRepository requestRepository;

	private final ProjectRepository projectRepository;

	private final SkillRepository skillRepository;

	private final AllocationRepository allocationRepository;

	private final RequestStatusService requestStatusService;

	public StaffingRequestService(StaffingRequestRepository requestRepository, ProjectRepository projectRepository,
			SkillRepository skillRepository, AllocationRepository allocationRepository,
			RequestStatusService requestStatusService) {
		this.requestRepository = requestRepository;
		this.projectRepository = projectRepository;
		this.skillRepository = skillRepository;
		this.allocationRepository = allocationRepository;
		this.requestStatusService = requestStatusService;
	}

	@Transactional(readOnly = true)
	public Page<StaffingRequestDto> listForProject(Long projectId, Pageable pageable) {
		if (!projectRepository.existsById(projectId)) {
			throw new NotFoundException("Project", projectId);
		}
		Page<StaffingRequest> page = requestRepository.findByProjectId(projectId, checkedSort(pageable));
		Map<Long, Long> filled = new HashMap<>();
		if (page.hasContent()) {
			List<Long> ids = page.getContent().stream().map(StaffingRequest::getId).toList();
			for (Object[] row : allocationRepository.countEmployeesByRequests(ids, AllocationStatus.ACTIVE)) {
				filled.put((Long) row[0], (Long) row[1]);
			}
		}
		return page.map(request -> StaffingRequestDto.from(request, filled.getOrDefault(request.getId(), 0L)));
	}

	/** BR-4: only the PM who owns the request's project can read a single request. */
	@Transactional(readOnly = true)
	public StaffingRequestDto get(Long id, AuthUser currentUser) {
		StaffingRequest request = find(id);
		checkOwner(request.getProject(), currentUser);
		return toDto(request);
	}

	/**
	 * The new request is {@code OPEN}. BR-4: only the project's PM. BR-3: the period is inside the project's, and it
	 * doesn't end before today, since nobody could be proposed for it any more. The title isn't taken by another
	 * request of the project that isn't cancelled (409).
	 */
	@Transactional
	public StaffingRequestDto create(Long projectId, StaffingRequestRequest body, AuthUser currentUser) {
		Project project = projectRepository.findById(projectId)
			.orElseThrow(() -> new NotFoundException("Project", projectId));
		checkOwner(project, currentUser);
		checkProjectOpen(project);
		checkValues(body, project);
		checkNotEnded(body.endDate());
		checkTitleFree(project, body.title().trim(), null);
		Map<Long, Skill> skills = resolveSkills(body.skills());

		StaffingRequest request = new StaffingRequest(project, body.title().trim(), body.seniority(),
				body.allocationPercent(), body.startDate(), body.endDate(), body.headcount());
		applySkills(request, body.skills(), skills);
		return StaffingRequestDto.from(requestRepository.save(request), 0);
	}

	/**
	 * BR-3 and BR-4 again. The skills replace the current ones. While the request has allocations, the edit must
	 * still fit them: the period covers every proposed and active allocation, a pending change included (BR-3,
	 * 400 ALLOCATION_OUTSIDE_REQUEST, as for a proposal outside the request), and the headcount is not below
	 * the number of people already allocated (409 HEADCOUNT_BELOW_FILLED). The allocations keep their own percent and the RM's decisions, so a new
	 * percent or new skills only apply to the next proposals. Then the status is recalculated (BR-10): a higher
	 * headcount reopens a filled request, and one lowered to the people allocated fills it, which closes it.
	 */
	@Transactional
	public StaffingRequestDto update(Long id, StaffingRequestRequest body, AuthUser currentUser) {
		StaffingRequest request = find(id);
		checkOwner(request.getProject(), currentUser);
		if (request.getStatus() == RequestStatus.CANCELLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_CANCELLED", "A cancelled request can't be edited");
		}
		checkProjectOpen(request.getProject());
		checkValues(body, request.getProject());
		if (!body.endDate().equals(request.getEndDate())) {
			checkNotEnded(body.endDate());
		}
		checkTitleFree(request.getProject(), body.title().trim(), request.getId());
		checkFitsAllocations(request, body);
		Map<Long, Skill> skills = resolveSkills(body.skills());

		request.setTitle(body.title().trim());
		request.setSeniority(body.seniority());
		request.setAllocationPercent(body.allocationPercent());
		request.setStartDate(body.startDate());
		request.setEndDate(body.endDate());
		request.setHeadcount(body.headcount());
		applySkills(request, body.skills(), skills);
		requestStatusService.recalculate(request.getId());
		return toDto(request);
	}

	/**
	 * Cancels the request (it is never deleted). BR-4: only the project's PM. §9: only a request nobody is
	 * allocated to can be cancelled, i.e. an {@code OPEN} one (409 REQUEST_HAS_ACTIVE_ALLOCATIONS otherwise),
	 * because an approved allocation can't stay on a cancelled request. To stop looking for more people on a
	 * partially filled request, lower its headcount instead. The request's proposals are cancelled with it, so
	 * they leave the RM's pending approvals.
	 */
	@Transactional
	public StaffingRequestDto cancel(Long id, AuthUser currentUser) {
		StaffingRequest request = find(id);
		checkOwner(request.getProject(), currentUser);
		switch (request.getStatus()) {
			case CANCELLED -> throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_CANCELLED",
					"The request is already cancelled");
			case OPEN, PARTIALLY_FILLED, FILLED -> {
			}
		}
		long people = requestStatusService.activePeople(id);
		if (people > 0) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_HAS_ACTIVE_ALLOCATIONS",
					"This request has " + (people == 1 ? "1 person" : people + " people") + " allocated, so it can't "
							+ "be cancelled. Cancel their allocations first, or lower the headcount to " + people
							+ " to stop looking for more people");
		}
		allocationRepository.findByRequestIdAndStatus(id, AllocationStatus.PROPOSED)
			.forEach(proposal -> proposal.setStatus(AllocationStatus.CANCELLED));
		request.setStatus(RequestStatus.CANCELLED);
		return StaffingRequestDto.from(request, 0);
	}

	private StaffingRequestDto toDto(StaffingRequest request) {
		return StaffingRequestDto.from(request, requestStatusService.activePeople(request.getId()));
	}

	/** A request that has already ended can't take a proposal, so it isn't created or moved there either. */
	private static void checkNotEnded(LocalDate endDate) {
		if (endDate.isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "REQUEST_IN_PAST",
					"The request must not end in the past");
		}
	}

	private void checkTitleFree(Project project, String title, Long excludeId) {
		if (requestRepository.existsOpenTitle(project.getId(), title, excludeId)) {
			throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_TITLE_TAKEN",
					"This project already has a request called '" + title + "'");
		}
	}

	/**
	 * The edited request must still hold its allocations: every proposed or active one, with its pending change,
	 * inside the new period (BR-3), and at least as many places as people already allocated (BR-10).
	 */
	private void checkFitsAllocations(StaffingRequest request, StaffingRequestRequest body) {
		for (Allocation allocation : allocationRepository.findByRequestIdAndStatusIn(request.getId(),
				AllocationStatus.ACTIVE_OR_PROPOSED)) {
			LocalDate start = allocation.getStartDate();
			LocalDate end = allocation.getEndDate();
			if (allocation.hasPendingChange()) {
				start = start.isBefore(allocation.getPendingStartDate()) ? start : allocation.getPendingStartDate();
				end = end.isAfter(allocation.getPendingEndDate()) ? end : allocation.getPendingEndDate();
			}
			if (start.isBefore(body.startDate()) || end.isAfter(body.endDate())) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, "ALLOCATION_OUTSIDE_REQUEST",
						"The request period must still cover its allocations: " + allocation.getEmployee().getFirstName()
								+ " " + allocation.getEmployee().getLastName() + " is allocated from " + start + " to "
								+ end);
			}
		}
		long people = requestStatusService.activePeople(request.getId());
		if (body.headcount() < people) {
			throw new BusinessException(HttpStatus.CONFLICT, "HEADCOUNT_BELOW_FILLED",
					"The headcount can't be lower than the " + people + " people already allocated");
		}
	}

	private StaffingRequest find(Long id) {
		return requestRepository.findById(id).orElseThrow(() -> new NotFoundException("Staffing request", id));
	}

	/** BR-4. */
	private static void checkOwner(Project project, AuthUser currentUser) {
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can manage its staffing requests");
		}
	}

	/** Requests of a finished project are cancelled by BR-11, so no new or changed ones are accepted. */
	private static void checkProjectOpen(Project project) {
		if (project.getStatus().isClosed()) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_CLOSED",
					"A " + project.getStatus().name().toLowerCase() + " project can't have staffing requests changed");
		}
	}

	/** BR-3 and the step of the allocation. Bean Validation has already checked the ranges and required fields. */
	private static void checkValues(StaffingRequestRequest body, Project project) {
		if (body.allocationPercent() % 10 != 0) {
			throw validationError("allocationPercent", "Allocation must be a multiple of 10");
		}
		if (body.startDate().isAfter(body.endDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD",
					"Start date must not be after end date");
		}
		if (body.startDate().isBefore(project.getStartDate()) || body.endDate().isAfter(project.getEndDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "REQUEST_OUTSIDE_PROJECT",
					"The request period must be inside the project period (" + project.getStartDate() + " to "
							+ project.getEndDate() + ")");
		}
	}

	/** Every skill must exist and appear once. Returns them by id. */
	private Map<Long, Skill> resolveSkills(List<RequestSkillRequest> requested) {
		Set<Long> seen = new HashSet<>();
		for (int i = 0; i < requested.size(); i++) {
			if (!seen.add(requested.get(i).skillId())) {
				throw validationError("skills[" + i + "].skillId", "This skill is listed more than once");
			}
		}
		Map<Long, Skill> skills = skillRepository.findAllById(seen)
			.stream()
			.collect(Collectors.toMap(Skill::getId, Function.identity()));
		for (int i = 0; i < requested.size(); i++) {
			if (!skills.containsKey(requested.get(i).skillId())) {
				throw validationError("skills[" + i + "].skillId", "Skill " + requested.get(i).skillId() + " not found");
			}
		}
		return skills;
	}

	/** Makes the request's skills match the list. Skills that stay are updated in place, so no row is deleted and re-inserted. */
	private static void applySkills(StaffingRequest request, List<RequestSkillRequest> requested,
			Map<Long, Skill> skills) {
		request.retainSkills(skills.keySet());
		for (RequestSkillRequest skill : requested) {
			request.putSkill(skills.get(skill.skillId()), skill.minLevel(), skill.mandatory());
		}
	}

	/** The same body as a Bean Validation failure, so the form can show the message next to the field. */
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
