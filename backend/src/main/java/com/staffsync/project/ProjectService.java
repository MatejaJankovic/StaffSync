package com.staffsync.project;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.project.dto.ProjectDto;
import com.staffsync.project.dto.ProjectRequest;
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

	public ProjectService(ProjectRepository projectRepository, UserRepository userRepository) {
		this.projectRepository = projectRepository;
		this.userRepository = userRepository;
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

	/** The current user becomes the project's PM, and the status starts as {@code PLANNED}. */
	@Transactional
	public ProjectDto create(ProjectRequest request, AuthUser currentUser) {
		checkPeriod(request);
		User pm = userRepository.findById(currentUser.id())
			.orElseThrow(() -> new NotFoundException("User", currentUser.id()));
		Project project = new Project(request.name().trim(), request.client().trim(), cleanDescription(request),
				request.startDate(), request.endDate(), pm);
		return ProjectDto.from(projectRepository.save(project));
	}

	/** BR-4: only the PM who owns the project can change it. The status is not touched here. */
	@Transactional
	public ProjectDto update(Long id, ProjectRequest request, AuthUser currentUser) {
		Project project = find(id);
		if (!project.getPm().getId().equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.FORBIDDEN, "NOT_PROJECT_OWNER",
					"Only the project manager who owns this project can change it");
		}
		if (project.getStatus() == ProjectStatus.COMPLETED || project.getStatus() == ProjectStatus.CANCELLED) {
			throw new BusinessException(HttpStatus.CONFLICT, "PROJECT_CLOSED",
					"A " + project.getStatus().name().toLowerCase() + " project can't be edited");
		}
		checkPeriod(request);
		project.setName(request.name().trim());
		project.setClient(request.client().trim());
		project.setDescription(cleanDescription(request));
		project.setStartDate(request.startDate());
		project.setEndDate(request.endDate());
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
