package com.staffsync.request;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

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

	public StaffingRequestService(StaffingRequestRepository requestRepository, ProjectRepository projectRepository,
			SkillRepository skillRepository) {
		this.requestRepository = requestRepository;
		this.projectRepository = projectRepository;
		this.skillRepository = skillRepository;
	}

	@Transactional(readOnly = true)
	public Page<StaffingRequestDto> listForProject(Long projectId, Pageable pageable) {
		if (!projectRepository.existsById(projectId)) {
			throw new NotFoundException("Project", projectId);
		}
		return requestRepository.findByProjectId(projectId, checkedSort(pageable)).map(StaffingRequestDto::from);
	}

	/** BR-4: only the PM who owns the request's project can read a single request. */
	@Transactional(readOnly = true)
	public StaffingRequestDto get(Long id, AuthUser currentUser) {
		StaffingRequest request = find(id);
		checkOwner(request.getProject(), currentUser);
		return StaffingRequestDto.from(request);
	}

	/** The new request is {@code OPEN}. BR-4: only the project's PM. BR-3: the period is inside the project's. */
	@Transactional
	public StaffingRequestDto create(Long projectId, StaffingRequestRequest body, AuthUser currentUser) {
		Project project = projectRepository.findById(projectId)
			.orElseThrow(() -> new NotFoundException("Project", projectId));
		checkOwner(project, currentUser);
		checkProjectOpen(project);
		checkValues(body, project);
		Map<Long, Skill> skills = resolveSkills(body.skills());

		StaffingRequest request = new StaffingRequest(project, body.title().trim(), body.seniority(),
				body.allocationPercent(), body.startDate(), body.endDate(), body.headcount());
		applySkills(request, body.skills(), skills);
		return StaffingRequestDto.from(requestRepository.save(request));
	}

	/**
	 * BR-3 and BR-4 again. The skills replace the current ones. The status is not touched here: it is
	 * calculated from the allocations (BR-10).
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
		Map<Long, Skill> skills = resolveSkills(body.skills());
		// TODO(#18, BR-3, BR-10): once the allocation table exists (#23), refuse to lower the headcount or to
		// change the period or the allocation percentage while the request has active allocations

		request.setTitle(body.title().trim());
		request.setSeniority(body.seniority());
		request.setAllocationPercent(body.allocationPercent());
		request.setStartDate(body.startDate());
		request.setEndDate(body.endDate());
		request.setHeadcount(body.headcount());
		applySkills(request, body.skills(), skills);
		return StaffingRequestDto.from(request);
	}

	/**
	 * Cancels the request (it is never deleted). BR-4: only the project's PM. §9: a request can be
	 * cancelled from {@code OPEN} or {@code PARTIALLY_FILLED}, but not once it is {@code FILLED}.
	 */
	@Transactional
	public StaffingRequestDto cancel(Long id, AuthUser currentUser) {
		StaffingRequest request = find(id);
		checkOwner(request.getProject(), currentUser);
		switch (request.getStatus()) {
			case CANCELLED -> throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_CANCELLED",
					"The request is already cancelled");
			case FILLED -> throw new BusinessException(HttpStatus.CONFLICT, "REQUEST_HAS_ACTIVE_ALLOCATIONS",
					"A filled request can't be cancelled. Cancel one of its allocations first");
			case OPEN, PARTIALLY_FILLED -> {
			}
		}
		// TODO(#18 open question, to agree with Lazar): once the allocation table exists (#23), cancel the
		// request's PROPOSED allocations here, and decide what happens to its approved ones
		request.setStatus(RequestStatus.CANCELLED);
		return StaffingRequestDto.from(request);
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
