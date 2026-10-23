package com.staffsync.user;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.ErrorResponse.FieldViolation;
import com.staffsync.common.GlobalExceptionHandler;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.user.dto.AvailabilityDto;
import com.staffsync.user.dto.CreateUserRequest;
import com.staffsync.user.dto.DayAvailabilityDto;
import com.staffsync.user.dto.TeamMemberDto;
import com.staffsync.user.dto.UpdateUserRequest;
import com.staffsync.user.dto.UserAccountDto;
import com.staffsync.user.dto.UserFields;
import jakarta.persistence.criteria.Predicate;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Accounts are created by an Admin with a temporary password; there is no self-registration (§12). */
@Service
public class UserService {

	public static final String EMAIL_TAKEN = "EMAIL_TAKEN";

	public static final String HAS_ACTIVE_ALLOCATIONS = "USER_HAS_ACTIVE_ALLOCATIONS";

	public static final String RM_HAS_TEAM = "RM_HAS_TEAM";

	public static final String CANNOT_DEACTIVATE_SELF = "CANNOT_DEACTIVATE_SELF";

	public static final String CANNOT_CHANGE_OWN_ROLE = "CANNOT_CHANGE_OWN_ROLE";

	public static final String INVALID_PERIOD = "INVALID_PERIOD";

	/** The unique index on {@code lower(email)}, see V1. */
	private static final String EMAIL_INDEX = "uq_users_email_lower";

	/** §5: the only capacities a user can have. */
	private static final Set<Integer> CAPACITIES = Set.of(100, 80, 50);

	/** BCrypt hashes at most 72 bytes, and Spring Security refuses a longer password instead of cutting it. */
	private static final int PASSWORD_MAX_BYTES = 72;

	/** The properties a list can be sorted by. Anything else is a 400, not a 500 from the query. */
	private static final Set<String> SORTABLE = Set.of("id", "email", "firstName", "lastName", "role", "seniority",
			"capacityPercent", "active");

	/** Last name, then first name, then id, so equal names keep a stable order. */
	private static final Comparator<User> BY_NAME = Comparator.comparing(User::getLastName)
		.thenComparing(User::getFirstName)
		.thenComparing(User::getId);

	private final UserRepository userRepository;

	private final DepartmentRepository departmentRepository;

	private final AllocationRepository allocationRepository;

	private final CapacityService capacityService;

	private final PasswordEncoder passwordEncoder;

	public UserService(UserRepository userRepository, DepartmentRepository departmentRepository,
			AllocationRepository allocationRepository, CapacityService capacityService,
			PasswordEncoder passwordEncoder) {
		this.userRepository = userRepository;
		this.departmentRepository = departmentRepository;
		this.allocationRepository = allocationRepository;
		this.capacityService = capacityService;
		this.passwordEncoder = passwordEncoder;
	}

	@Transactional(readOnly = true)
	public Page<UserAccountDto> list(Long departmentId, Role role, Boolean active, Pageable pageable) {
		Specification<User> filters = (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (departmentId != null) {
				predicates.add(cb.equal(root.get("department").get("id"), departmentId));
			}
			if (role != null) {
				predicates.add(cb.equal(root.get("role"), role));
			}
			if (active != null) {
				predicates.add(cb.equal(root.get("active"), active));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
		return userRepository.findAll(filters, checkedSort(pageable)).map(UserAccountDto::from);
	}

	@Transactional(readOnly = true)
	public List<TeamMemberDto> myTeam(AuthUser currentUser) {
		return myTeam(currentUser, LocalDate.now());
	}

	/**
	 * The RM's team as of {@code today}: their active users ({@code manager_id}, BR-5), the same team and the
	 * same load as the RM Home cards. On a weekend the load is the next Monday's. Sorted by name.
	 */
	List<TeamMemberDto> myTeam(AuthUser currentUser, LocalDate today) {
		LocalDate day = CapacityService.workingDayFrom(today);
		return userRepository.findByManagerIdAndActiveTrue(currentUser.id())
			.stream()
			.sorted(BY_NAME)
			.map(member -> TeamMemberDto.from(member,
					capacityService.getDailyLoad(member.getId(), day, day, null).getOrDefault(day, 0)))
			.toList();
	}

	/**
	 * §7: the user's load and free capacity per working day of {@code [from, to]}, from active allocations with
	 * their current values (BR-16). The period is at most a year, so walking it day by day stays cheap. Free
	 * comes from {@link CapacityService#getFreeCapacity}, the same method matching uses, so the two never drift
	 * (BR-1, §7).
	 */
	@Transactional(readOnly = true)
	public AvailabilityDto availability(Long id, LocalDate from, LocalDate to) {
		if (from.isAfter(to)) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, INVALID_PERIOD, "From must not be after to");
		}
		if (to.isAfter(from.plusYears(1))) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, INVALID_PERIOD,
					"The period must not be longer than a year");
		}
		User user = find(id);
		Map<LocalDate, Integer> free = capacityService.getFreeCapacity(id, from, to);
		List<DayAvailabilityDto> days = capacityService.getDailyLoad(id, from, to, null)
			.entrySet()
			.stream()
			.map(day -> new DayAvailabilityDto(day.getKey(), day.getValue(), free.get(day.getKey())))
			.toList();
		return new AvailabilityDto(id, user.getCapacityPercent(), from, to, days);
	}

	/** Emails are unique regardless of case (409). The temporary password is stored as a BCrypt hash. */
	@Transactional
	public UserAccountDto create(CreateUserRequest request) {
		String email = request.email().trim();
		if (userRepository.existsByEmailIgnoreCase(email)) {
			throw emailTaken(email);
		}
		List<FieldViolation> violations = new ArrayList<>();
		checkPasswordLength(request.temporaryPassword(), violations);
		Links links = validate(null, request, violations);
		User user = new User(email, passwordEncoder.encode(request.temporaryPassword()), request.firstName().trim(),
				request.lastName().trim(), request.role());
		copy(user, request, links);
		return UserAccountDto.from(saveAndFlush(user, email));
	}

	/**
	 * The same checks as {@link #create}, plus these 409s: the Admin can't change their own role, so an
	 * Admin is always left; an RM who still has active employees keeps the RM role; an employee with
	 * allocations or proposals that haven't ended stays an employee, because only their RM can decide on
	 * them (BR-5); and BR-13: capacity can't go down if the active allocations from today on would exceed
	 * it ({@code CAPACITY_EXCEEDED} with the overloaded days, T-23). The password is never changed here.
	 */
	@Transactional
	public UserAccountDto update(Long id, UpdateUserRequest request, AuthUser currentUser) {
		User user = find(id);
		String email = request.email().trim();
		if (userRepository.existsByEmailIgnoreCaseAndIdNot(email, id)) {
			throw emailTaken(email);
		}
		Links links = validate(user, request, new ArrayList<>());

		// Checked before the user is changed: a query would flush the change outside saveAndFlush's catch
		boolean roleChanges = request.role() != user.getRole();
		if (roleChanges && id.equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.CONFLICT, CANNOT_CHANGE_OWN_ROLE, "You can't change your own role");
		}
		if (roleChanges && user.getRole() == Role.RM && userRepository.existsByManagerIdAndActiveTrue(id)) {
			throw rmHasTeam("given another role");
		}
		if (roleChanges && user.getRole() == Role.EMPLOYEE
				&& hasAllocationsFrom(id, AllocationStatus.ACTIVE_OR_PROPOSED, LocalDate.now())) {
			throw hasActiveAllocations(user, "current or future allocations or proposals and must stay an employee");
		}
		if (request.capacityPercent() < user.getCapacityPercent()) {
			capacityService.checkCapacityReduction(id, request.capacityPercent());
		}
		copy(user, request, links);
		return UserAccountDto.from(saveAndFlush(user, email));
	}

	/**
	 * BR-12 / BR-16: a user with an APPROVED or CHANGE_PENDING allocation that hasn't ended yet can't be
	 * deactivated (409, T-22). Neither can the Admin themself, or an RM who still has active employees.
	 * A deactivated user can't log in, and their tokens stop working (T-37).
	 */
	@Transactional
	public UserAccountDto deactivate(Long id, AuthUser currentUser) {
		User user = find(id);
		if (id.equals(currentUser.id())) {
			throw new BusinessException(HttpStatus.CONFLICT, CANNOT_DEACTIVATE_SELF,
					"You can't deactivate your own account");
		}
		if (hasAllocationsFrom(id, AllocationStatus.ACTIVE, LocalDate.now())) {
			throw hasActiveAllocations(user, "current or future allocations and can't be deactivated");
		}
		if (user.getRole() == Role.RM && userRepository.existsByManagerIdAndActiveTrue(id)) {
			throw rmHasTeam("deactivated");
		}
		user.setActive(false);
		return UserAccountDto.from(user);
	}

	/** Whether the employee has an allocation in the given statuses that ends on or after {@code day}. */
	private boolean hasAllocationsFrom(Long employeeId, Set<AllocationStatus> statuses, LocalDate day) {
		LocalDate lastDay = allocationRepository.findLatestEndDate(employeeId, statuses);
		return lastDay != null && !lastDay.isBefore(day);
	}

	private User find(Long id) {
		return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User", id));
	}

	/**
	 * {@code @Size(max = 72)} counts characters, but BCrypt's limit is in bytes: 40 letters like "č" are 80,
	 * and encoding them would fail with a 500. Checked here so the form can show it next to the password.
	 */
	private static void checkPasswordLength(String password, List<FieldViolation> violations) {
		if (password.getBytes(StandardCharsets.UTF_8).length > PASSWORD_MAX_BYTES) {
			violations.add(new FieldViolation("temporaryPassword",
					"Temporary password must be at most 72 bytes (an accented letter counts as 2)"));
		}
	}

	/** The department and resource manager a valid request names; either can be {@code null}. */
	private record Links(Department department, User manager) {
	}

	/**
	 * Checks what Bean Validation can't, for a new user ({@code user} is {@code null}) or an existing one.
	 * Every problem, with the {@code violations} found before, is a 400 {@code VALIDATION_ERROR} on its
	 * field, so the form can show them all next to their fields at once.
	 */
	private Links validate(User user, UserFields request, List<FieldViolation> violations) {
		if (!CAPACITIES.contains(request.capacityPercent())) {
			violations.add(new FieldViolation("capacityPercent", "Capacity must be 100, 80 or 50"));
		}

		Department department = null;
		if (request.departmentId() != null) {
			department = departmentRepository.findById(request.departmentId()).orElse(null);
			if (department == null) {
				violations.add(new FieldViolation("departmentId", "Department " + request.departmentId() + " not found"));
			}
		}
		else if (request.role() == Role.EMPLOYEE) {
			violations.add(new FieldViolation("departmentId", "An employee needs a department"));
		}

		User manager = null;
		if (request.role() != Role.EMPLOYEE) {
			if (request.managerId() != null) {
				violations.add(new FieldViolation("managerId", "Only an employee has a resource manager"));
			}
		}
		else if (request.managerId() == null) {
			violations.add(new FieldViolation("managerId", "An employee needs a resource manager"));
		}
		else if (user != null && request.managerId().equals(user.getId())) {
			violations.add(new FieldViolation("managerId", "A user can't be their own resource manager"));
		}
		else {
			// The current manager may have been deactivated or given another role since, which only an
			// inactive employee's manager can be. Keeping them must not block editing the other fields
			boolean unchanged = user != null && user.getManager() != null
					&& request.managerId().equals(user.getManager().getId());
			manager = userRepository.findById(request.managerId())
				.filter(candidate -> unchanged || candidate.getRole() == Role.RM && candidate.isActive())
				.orElse(null);
			if (manager == null) {
				violations.add(new FieldViolation("managerId", "The manager must be an active resource manager"));
			}
		}

		if (!violations.isEmpty()) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR,
					"Some fields are invalid", violations);
		}
		return new Links(department, manager);
	}

	private static void copy(User user, UserFields request, Links links) {
		user.setEmail(request.email().trim());
		user.setFirstName(request.firstName().trim());
		user.setLastName(request.lastName().trim());
		user.setRole(request.role());
		user.setDepartment(links.department());
		user.setManager(links.manager());
		user.setSeniority(request.seniority());
		user.setCapacityPercent(request.capacityPercent());
	}

	// The email was checked above, so a violation of its index means a concurrent request saved the
	// same email first. Anything else, e.g. a department deleted meanwhile, is not about the email
	private User saveAndFlush(User user, String email) {
		try {
			return userRepository.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getCause() instanceof ConstraintViolationException violation
					&& EMAIL_INDEX.equals(violation.getConstraintName())) {
				throw emailTaken(email);
			}
			throw ex;
		}
	}

	private static BusinessException hasActiveAllocations(User user, String problem) {
		return new BusinessException(HttpStatus.CONFLICT, HAS_ACTIVE_ALLOCATIONS,
				user.getFirstName() + " " + user.getLastName() + " has " + problem);
	}

	// Their employees' allocations could no longer be approved by anyone (BR-5)
	private static BusinessException rmHasTeam(String action) {
		return new BusinessException(HttpStatus.CONFLICT, RM_HAS_TEAM,
				"This resource manager still has active employees and can't be " + action
						+ ". Move the employees to another resource manager first");
	}

	private static BusinessException emailTaken(String email) {
		return new BusinessException(HttpStatus.CONFLICT, EMAIL_TAKEN, "A user with email '" + email + "' already exists");
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
