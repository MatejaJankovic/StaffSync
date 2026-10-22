package com.staffsync.user;

import java.time.LocalDate;
import java.util.ArrayList;
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
import com.staffsync.user.dto.CreateUserRequest;
import com.staffsync.user.dto.UpdateUserRequest;
import com.staffsync.user.dto.UserAccountDto;
import com.staffsync.user.dto.UserFields;
import jakarta.persistence.criteria.Predicate;
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

	/** §5: the only capacities a user can have. */
	private static final Set<Integer> CAPACITIES = Set.of(100, 80, 50);

	/** The properties a list can be sorted by. Anything else is a 400, not a 500 from the query. */
	private static final Set<String> SORTABLE = Set.of("id", "email", "firstName", "lastName", "role", "seniority",
			"capacityPercent", "active");

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

	/** Emails are unique regardless of case (409). The temporary password is stored as a BCrypt hash. */
	@Transactional
	public UserAccountDto create(CreateUserRequest request) {
		String email = request.email().trim();
		if (userRepository.existsByEmailIgnoreCase(email)) {
			throw emailTaken(email);
		}
		User user = new User(email, passwordEncoder.encode(request.temporaryPassword()), request.firstName().trim(),
				request.lastName().trim(), request.role());
		apply(user, request);
		return UserAccountDto.from(saveAndFlush(user, email));
	}

	/**
	 * The same checks as {@link #create}, plus: an RM who still has active employees keeps the RM role
	 * (409), and BR-13: capacity can't go down if the active allocations from today on would exceed it
	 * (409 {@code CAPACITY_EXCEEDED} with the overloaded days, T-23). The password is never changed here.
	 */
	@Transactional
	public UserAccountDto update(Long id, UpdateUserRequest request) {
		User user = find(id);
		String email = request.email().trim();
		if (userRepository.existsByEmailIgnoreCaseAndIdNot(email, id)) {
			throw emailTaken(email);
		}
		Role oldRole = user.getRole();
		int oldCapacity = user.getCapacityPercent();
		apply(user, request);

		if (oldRole == Role.RM && user.getRole() != Role.RM && userRepository.existsByManagerIdAndActiveTrue(id)) {
			throw rmHasTeam("given another role");
		}
		if (user.getCapacityPercent() < oldCapacity) {
			checkCapacityReduction(user);
		}
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
		if (allocationRepository.existsByEmployeeIdAndStatusInAndEndDateGreaterThanEqual(id,
				AllocationStatus.ACTIVE, LocalDate.now())) {
			throw new BusinessException(HttpStatus.CONFLICT, HAS_ACTIVE_ALLOCATIONS, user.getFirstName() + " "
					+ user.getLastName() + " has current or future allocations and can't be deactivated");
		}
		if (user.getRole() == Role.RM && userRepository.existsByManagerIdAndActiveTrue(id)) {
			throw rmHasTeam("deactivated");
		}
		user.setActive(false);
		return UserAccountDto.from(user);
	}

	private void checkCapacityReduction(User user) {
		List<Map<String, Object>> overloaded = capacityService.findDaysOverCapacity(user.getId(),
				user.getCapacityPercent(), LocalDate.now());
		if (!overloaded.isEmpty()) {
			String days = overloaded.size() == 1 ? "1 day" : overloaded.size() + " days";
			throw new BusinessException(HttpStatus.CONFLICT, CapacityService.CAPACITY_EXCEEDED, "Lowering capacity to "
					+ user.getCapacityPercent() + "% would leave existing allocations over it on " + days, overloaded);
		}
	}

	private User find(Long id) {
		return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User", id));
	}

	/**
	 * Checks what Bean Validation can't and copies the fields onto the user. Every problem is a 400
	 * {@code VALIDATION_ERROR} on its field, so the form can show it next to that field.
	 */
	private void apply(User user, UserFields request) {
		List<FieldViolation> violations = new ArrayList<>();
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
		else if (request.managerId().equals(user.getId())) {
			violations.add(new FieldViolation("managerId", "A user can't be their own resource manager"));
		}
		else {
			manager = userRepository.findById(request.managerId())
				.filter(candidate -> candidate.getRole() == Role.RM && candidate.isActive())
				.orElse(null);
			if (manager == null) {
				violations.add(new FieldViolation("managerId", "The manager must be an active resource manager"));
			}
		}

		if (!violations.isEmpty()) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR,
					"Some fields are invalid", violations);
		}

		user.setEmail(request.email().trim());
		user.setFirstName(request.firstName().trim());
		user.setLastName(request.lastName().trim());
		user.setRole(request.role());
		user.setDepartment(department);
		user.setManager(manager);
		user.setSeniority(request.seniority());
		user.setCapacityPercent(request.capacityPercent());
	}

	// Everything else is checked above, so a violation here is the unique email index
	// (uq_users_email_lower): a concurrent request saved the same email first
	private User saveAndFlush(User user, String email) {
		try {
			return userRepository.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException ex) {
			throw emailTaken(email);
		}
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
