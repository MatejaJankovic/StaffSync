package com.staffsync.project;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.staffsync.allocation.AllocationService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.project.dto.ProjectDto;
import com.staffsync.project.dto.ProjectRequest;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
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
public class ProjectService {

	/** The properties a list can be sorted by. Anything else is a 400, not a 500 from the query. */
	private static final Set<String> SORTABLE = Set.of("id", "name", "client", "startDate", "endDate", "status");

	private final ProjectRepository projectRepository;

	private final UserRepository userRepository;

	private final StaffingRequestRepository requestRepository;

	private final AllocationService allocationService;

	public ProjectService(ProjectRepository projectRepository, UserRepository userRepository,
			StaffingRequestRepository requestRepository, AllocationService allocationService) {
		this.projectRepository = projectRepository;
		this.userRepository = userRepository;
		this.requestRepository = requestRepository;
		this.allocationService = allocationService;
	}

	@Transactional(readOnly = true)
	public Page<ProjectDto> list(ProjectStatus status, Long pmId, Pageable pageable) {
		Specification<Project> filters = (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (status != null) {
				predicates.add(cb.equal(root.get("status"), status));
			}
			if (pmId != null) {
				predicates.add(cb.equal(root.get("pm").get("id"), pmId));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
		return projectRepository.findAll(filters, checkedSort(pageable)).map(ProjectDto::from);
	}

	@Transactional(readOnly = true)
	public ProjectDto get(Long id) {
		return ProjectDto.from(find(id));
	}

	/**
	 * The current user becomes the project's PM, and the status starts as {@code PLANNED}. The name is not taken
	 * (409), and the project doesn't end in the past: StaffSync plans work, it doesn't record finished projects.
	 */
	@Transactional
	public ProjectDto create(ProjectRequest request, AuthUser currentUser) {
		checkPeriod(request);
		checkNotEnded(request.endDate());
		if (projectRepository.existsByNameIgnoreCase(request.name().trim())) {
			throw nameTaken(request.name().trim());
		}
		User pm = userRepository.findById(currentUser.id())
			.orElseThrow(() -> new NotFoundException("User", currentUser.id()));
		Project project = new Project(request.name().trim(), request.client().trim(), cleanDescription(request),
				request.startDate(), request.endDate(), pm);
		return ProjectDto.from(projectRepository.save(project));
	}

	/**
	 * BR-4: only the PM who owns the project can change it. The status is not touched here. BR-3: the new period
	 * still covers every request that isn't cancelled (400 REQUESTS_OUTSIDE_PROJECT), so their allocations stay
	 * inside the project too. A new end date can't be in the past; to stop a project, complete or cancel it.
	 */
	@Transactional
	public ProjectDto update(Long id, ProjectRequest request, AuthUser currentUser) {
		Project project = find(id);
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can change it");
		}
		if (project.getStatus().isClosed()) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_CLOSED",
					"A " + label(project.getStatus()) + " project can't be edited");
		}
		checkPeriod(request);
		if (!request.endDate().equals(project.getEndDate())) {
			checkNotEnded(request.endDate());
		}
		if (projectRepository.existsByNameIgnoreCaseAndIdNot(request.name().trim(), id)) {
			throw nameTaken(request.name().trim());
		}
		checkCoversRequests(project, request);
		project.setName(request.name().trim());
		project.setClient(request.client().trim());
		project.setDescription(cleanDescription(request));
		project.setStartDate(request.startDate());
		project.setEndDate(request.endDate());
		return ProjectDto.from(project);
	}

	/**
	 * The PM who owns the project moves it to its next status (§9): {@code PLANNED → ACTIVE → COMPLETED}, or
	 * {@code PLANNED}/{@code ACTIVE → CANCELLED}. The checks run in this order: BR-4 (403), the move is allowed
	 * (409 INVALID_STATUS_TRANSITION, which includes staying in the same status), and a project starts on its start
	 * date at the earliest (409 PROJECT_NOT_STARTED: move the start date to start it earlier). Completing or
	 * cancelling it
	 * runs the BR-11 clean-up in this one transaction, with today as the closing day (T-21): first the
	 * allocations ({@link AllocationService#closeForProject}, which also recalculates their requests), then the
	 * requests left {@code OPEN} or {@code PARTIALLY_FILLED} are cancelled. A request still filled by its
	 * shortened allocations stays {@code FILLED}.
	 */
	@Transactional
	public ProjectDto changeStatus(Long id, ProjectStatus next, AuthUser currentUser) {
		Project project = find(id);
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can change its status");
		}
		ProjectStatus current = project.getStatus();
		if (!current.canMoveTo(next)) {
			throw new BusinessException(HttpStatus.CONFLICT, "INVALID_STATUS_TRANSITION",
					"A project can't move from " + label(current) + " to " + label(next));
		}

		if (next == ProjectStatus.ACTIVE && project.getStartDate().isAfter(LocalDate.now())) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_NOT_STARTED",
					"The project starts on " + project.getStartDate()
							+ ". To start it earlier, change its start date first");
		}

		project.setStatus(next);
		if (next.isClosed()) {
			allocationService.closeForProject(id, LocalDate.now());
			requestRepository
				.findByProjectIdAndStatusIn(id, List.of(RequestStatus.OPEN, RequestStatus.PARTIALLY_FILLED))
				.forEach(request -> request.setStatus(RequestStatus.CANCELLED));
		}
		return ProjectDto.from(project);
	}

	private Project find(Long id) {
		return projectRepository.findById(id).orElseThrow(() -> new NotFoundException("Project", id));
	}

	/** BR-3: {@code startDate ≤ endDate}. */
	private static void checkPeriod(ProjectRequest request) {
		if (request.startDate().isAfter(request.endDate())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_PERIOD",
					"Start date must not be after end date");
		}
	}

	private static void checkNotEnded(LocalDate endDate) {
		if (endDate.isBefore(LocalDate.now())) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "PROJECT_IN_PAST", "The project must not end in the past");
		}
	}

	private static BusinessException nameTaken(String name) {
		return new BusinessException(HttpStatus.CONFLICT, "PROJECT_NAME_TAKEN",
				"A project named '" + name + "' already exists");
	}

	/** BR-3: the requests' periods lie inside the project's, so the project can't shrink past one of them. */
	private void checkCoversRequests(Project project, ProjectRequest request) {
		for (StaffingRequest staffing : requestRepository.findByProjectIdAndStatusIn(project.getId(),
				List.of(RequestStatus.OPEN, RequestStatus.PARTIALLY_FILLED, RequestStatus.FILLED))) {
			if (staffing.getStartDate().isBefore(request.startDate())
					|| staffing.getEndDate().isAfter(request.endDate())) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, "REQUESTS_OUTSIDE_PROJECT",
						"The project period must still cover its staffing requests: '" + staffing.getTitle()
								+ "' runs from " + staffing.getStartDate() + " to " + staffing.getEndDate());
			}
		}
	}

	/** A status as the messages write it: {@code COMPLETED} → {@code "completed"}. */
	private static String label(ProjectStatus status) {
		return status.name().toLowerCase();
	}

	private static String cleanDescription(ProjectRequest request) {
		String description = request.description() == null ? "" : request.description().trim();
		return description.isEmpty() ? null : description;
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
