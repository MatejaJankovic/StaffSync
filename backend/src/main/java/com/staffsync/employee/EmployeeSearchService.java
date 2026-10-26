package com.staffsync.employee;

import java.text.Collator;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Stream;

import com.staffsync.allocation.CapacityService;
import com.staffsync.common.BusinessException;
import com.staffsync.common.ErrorResponse.FieldViolation;
import com.staffsync.common.GlobalExceptionHandler;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.employee.dto.EmployeeSearchResultDto;
import com.staffsync.employee.dto.SkillLevelDto;
import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.employeeskill.EmployeeSkillRepository;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import com.staffsync.user.UserService;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * *Employee search* (US-23): active employees by skill, seniority, department and free capacity in a period, so a
 * PM or RM can find people on the bench without a staffing request. The skill, seniority and department filters
 * run in the query, and the availability filter then walks the smaller set with {@link CapacityService}.
 */
@Service
@Transactional(readOnly = true)
public class EmployeeSearchService {

	public static final String INVALID_AVAILABILITY_FILTER = "INVALID_AVAILABILITY_FILTER";

	/** How many skills a result shows as the employee's main skills. */
	static final int TOP_SKILLS = 3;

	/**
	 * How names and departments are ordered: by letter, not by character code, so "de Souza" doesn't come after
	 * "Zoric" and "Čolić" doesn't come after every name that starts with a plain letter.
	 */
	private static final Comparator<String> TEXT = Collator.getInstance(Locale.ROOT)::compare;

	/** Highest level first, then by name, so equal levels keep a stable order. */
	private static final Comparator<EmployeeSkill> BY_LEVEL = Comparator
		.comparingInt(EmployeeSkill::getLevel)
		.reversed()
		.thenComparing(rating -> rating.getSkill().getName(), TEXT);

	/** Last name, then first name, then id: the order of ties, so pages don't shuffle. */
	private static final Comparator<EmployeeSearchResultDto> BY_NAME = Comparator
		.comparing(EmployeeSearchResultDto::lastName, TEXT)
		.thenComparing(EmployeeSearchResultDto::firstName, TEXT)
		.thenComparing(EmployeeSearchResultDto::id);

	/**
	 * The properties a search can be sorted by. Anything else is a 400. level and free are computed, not columns,
	 * so the results are sorted here and not in the query. Missing values (no seniority, department or level) go
	 * last in both directions.
	 */
	private static final Map<String, Function<Sort.Direction, Comparator<EmployeeSearchResultDto>>> SORTABLE = Map.of(
			"id", key(EmployeeSearchResultDto::id),
			"firstName", key(EmployeeSearchResultDto::firstName, TEXT),
			"lastName", key(EmployeeSearchResultDto::lastName, TEXT),
			"seniority", key(EmployeeSearchResultDto::seniority),
			"department", key(row -> row.department() != null ? row.department().name() : null, TEXT),
			"level", key(EmployeeSearchResultDto::skillLevel),
			"free", key(EmployeeSearchResultDto::free));

	private final UserRepository userRepository;

	private final EmployeeSkillRepository employeeSkillRepository;

	private final SkillRepository skillRepository;

	private final DepartmentRepository departmentRepository;

	private final CapacityService capacityService;

	public EmployeeSearchService(UserRepository userRepository, EmployeeSkillRepository employeeSkillRepository,
			SkillRepository skillRepository, DepartmentRepository departmentRepository,
			CapacityService capacityService) {
		this.userRepository = userRepository;
		this.employeeSkillRepository = employeeSkillRepository;
		this.skillRepository = skillRepository;
		this.departmentRepository = departmentRepository;
		this.capacityService = capacityService;
	}

	public Page<EmployeeSearchResultDto> search(EmployeeSearchFilters filters, Pageable pageable) {
		return search(filters, pageable, LocalDate.now());
	}

	/**
	 * One page of the active employees who pass every filter, with their load on {@code today}'s working day (on a
	 * weekend, the next Monday's, as on *My team*). The whole result is built and sorted on every call and then
	 * cut into a page, the same way as matching: there are about 30 employees (§12), and level and free are
	 * sortable although they are computed.
	 */
	Page<EmployeeSearchResultDto> search(EmployeeSearchFilters filters, Pageable pageable, LocalDate today) {
		Comparator<EmployeeSearchResultDto> order = checkedSort(pageable.getSort());
		validate(filters);

		List<User> employees = userRepository.findAll(matching(filters));
		if (filters.filtersOnAvailability()) {
			employees = employees.stream().filter(employee -> isFreeEnough(employee, filters)).toList();
		}
		Map<Long, List<EmployeeSkill>> ratings = ratingsByEmployee(employees);
		LocalDate day = CapacityService.workingDayFrom(today);
		List<EmployeeSearchResultDto> rows = employees.stream()
			.map(employee -> toRow(employee, ratings.getOrDefault(employee.getId(), List.of()), filters.skillId(),
					day))
			.sorted(order)
			.toList();

		int from = (int) Math.min(pageable.getOffset(), rows.size());
		int to = (int) Math.min((long) from + pageable.getPageSize(), rows.size());
		return new PageImpl<>(rows.subList(from, to), pageable, rows.size());
	}

	/**
	 * 400 {@code VALIDATION_ERROR} for a minimum level without a skill, 400 {@code INVALID_AVAILABILITY_FILTER}
	 * when only some of the availability filters are given, 400 {@code INVALID_PERIOD} as on the availability
	 * endpoint, and 404 for an unknown skill or department. The ranges of minLevel and minFreePercent are checked
	 * on the controller.
	 */
	private void validate(EmployeeSearchFilters filters) {
		if (filters.minLevel() != null && filters.skillId() == null) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR,
					"Some fields are invalid", List.of(new FieldViolation("minLevel", "A minimum level needs a skill")));
		}
		long availability = Stream.of(filters.availableFrom(), filters.availableTo(), filters.minFreePercent())
			.filter(Objects::nonNull)
			.count();
		if (availability != 0 && availability != 3) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, INVALID_AVAILABILITY_FILTER,
					"availableFrom, availableTo and minFreePercent go together: send all three or none");
		}
		if (filters.filtersOnAvailability()) {
			if (filters.availableFrom().isAfter(filters.availableTo())) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, UserService.INVALID_PERIOD,
						"From must not be after to");
			}
			if (filters.availableTo().isAfter(filters.availableFrom().plusYears(1))) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, UserService.INVALID_PERIOD,
						"The period must not be longer than a year");
			}
		}
		if (filters.skillId() != null && !skillRepository.existsById(filters.skillId())) {
			throw new NotFoundException("Skill", filters.skillId());
		}
		if (filters.departmentId() != null && !departmentRepository.existsById(filters.departmentId())) {
			throw new NotFoundException("Department", filters.departmentId());
		}
	}

	/** Active employees with the seniority, the department and the skill at the minimum level (1 if not given). */
	private static Specification<User> matching(EmployeeSearchFilters filters) {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			predicates.add(cb.equal(root.get("role"), Role.EMPLOYEE));
			predicates.add(cb.isTrue(root.get("active")));
			if (filters.seniority() != null) {
				predicates.add(cb.equal(root.get("seniority"), filters.seniority()));
			}
			if (filters.departmentId() != null) {
				predicates.add(cb.equal(root.get("department").get("id"), filters.departmentId()));
			}
			if (filters.skillId() != null) {
				int minLevel = filters.minLevel() != null ? filters.minLevel() : 1;
				Subquery<Long> rated = query.subquery(Long.class);
				Root<EmployeeSkill> rating = rated.from(EmployeeSkill.class);
				rated.select(rating.get("id"))
					.where(cb.equal(rating.get("user"), root),
							cb.equal(rating.get("skill").get("id"), filters.skillId()),
							cb.greaterThanOrEqualTo(rating.<Integer>get("level"), minLevel));
				predicates.add(cb.exists(rated));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
	}

	/**
	 * Free capacity is at least minFreePercent on every working day of the period, the same idea as availability
	 * in matching (§7). A period with no working day has nothing to fail.
	 */
	private boolean isFreeEnough(User employee, EmployeeSearchFilters filters) {
		return capacityService.getFreeCapacity(employee.getId(), filters.availableFrom(), filters.availableTo())
			.values()
			.stream()
			.allMatch(free -> free >= filters.minFreePercent());
	}

	/** employee id → their skill ratings, for all the employees in one query. */
	private Map<Long, List<EmployeeSkill>> ratingsByEmployee(List<User> employees) {
		Map<Long, List<EmployeeSkill>> ratings = new HashMap<>();
		if (employees.isEmpty()) {
			return ratings;
		}
		List<Long> ids = employees.stream().map(User::getId).toList();
		for (EmployeeSkill rating : employeeSkillRepository.findByUserIdIn(ids)) {
			ratings.computeIfAbsent(rating.getUser().getId(), id -> new ArrayList<>()).add(rating);
		}
		return ratings;
	}

	private EmployeeSearchResultDto toRow(User employee, List<EmployeeSkill> ratings, Long skillId, LocalDate day) {
		Integer skillLevel = skillId == null ? null
				: ratings.stream()
					.filter(rating -> rating.getSkill().getId().equals(skillId))
					.map(EmployeeSkill::getLevel)
					.findFirst()
					.orElse(null);
		List<SkillLevelDto> topSkills = ratings.stream()
			.sorted(BY_LEVEL)
			.limit(TOP_SKILLS)
			.map(SkillLevelDto::from)
			.toList();
		int load = capacityService.getDailyLoad(employee.getId(), day, day, null).getOrDefault(day, 0);
		return EmployeeSearchResultDto.from(employee, skillLevel, topSkills, load);
	}

	/** The requested order, then by name. Rejects unknown sort properties with 400 {@code INVALID_SORT}. */
	private static Comparator<EmployeeSearchResultDto> checkedSort(Sort sort) {
		Comparator<EmployeeSearchResultDto> order = (a, b) -> 0;
		for (Sort.Order requested : sort) {
			Function<Sort.Direction, Comparator<EmployeeSearchResultDto>> key = SORTABLE.get(requested.getProperty());
			if (key == null) {
				throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_SORT",
						"Can't sort by '" + requested.getProperty() + "'. Sort by one of: "
								+ String.join(", ", SORTABLE.keySet().stream().sorted().toList()));
			}
			order = order.thenComparing(key.apply(requested.getDirection()));
		}
		return order.thenComparing(BY_NAME);
	}

	private static <K extends Comparable<? super K>> Function<Sort.Direction, Comparator<EmployeeSearchResultDto>> key(
			Function<EmployeeSearchResultDto, K> property) {
		return key(property, Comparator.<K>naturalOrder());
	}

	/** Missing values (null) go last in both directions. */
	private static <K> Function<Sort.Direction, Comparator<EmployeeSearchResultDto>> key(
			Function<EmployeeSearchResultDto, K> property, Comparator<K> order) {
		return direction -> Comparator.comparing(property,
				Comparator.nullsLast(direction.isAscending() ? order : order.reversed()));
	}

}
