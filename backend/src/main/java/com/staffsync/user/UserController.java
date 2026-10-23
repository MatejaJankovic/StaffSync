package com.staffsync.user;

import java.util.List;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import com.staffsync.user.dto.CreateUserRequest;
import com.staffsync.user.dto.TeamMemberDto;
import com.staffsync.user.dto.UpdateUserRequest;
import com.staffsync.user.dto.UserAccountDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@Tag(name = "Users", description = "An Admin creates, edits and deactivates accounts. There is no self-registration")
@SecurityRequirement(name = "bearerAuth")
public class UserController {

	private final UserService userService;

	public UserController(UserService userService) {
		this.userService = userService;
	}

	@Operation(summary = "List users, optionally by department, role and active status (Admin, RM)",
			description = "Paged, sorted by last name by default. Sortable by id, email, firstName, lastName, role, "
					+ "seniority, capacityPercent and active")
	@ApiResponse(responseCode = "200", description = "A page of users")
	@ApiResponse(responseCode = "400", description = "Unknown role or sort property",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin or RM",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasAnyRole('ADMIN', 'RM')")
	@GetMapping
	public Page<UserAccountDto> list(@RequestParam(required = false) Long departmentId,
			@RequestParam(required = false) Role role, @RequestParam(required = false) Boolean active,
			@ParameterObject @PageableDefault(sort = "lastName") Pageable pageable) {
		return userService.list(departmentId, role, active, pageable);
	}

	@Operation(summary = "My team with today's load (RM)",
			description = "The RM's active users (BR-5), sorted by last name. load is today's % from APPROVED and "
					+ "CHANGE_PENDING allocations, and free is capacityPercent − load. On a weekend, the loads are "
					+ "those of the next Monday, as on the Home cards")
	@ApiResponse(responseCode = "200", description = "The team members, possibly none",
			content = @Content(array = @ArraySchema(schema = @Schema(implementation = TeamMemberDto.class)),
					examples = @ExampleObject(value = """
							[
							  { "id": 4, "firstName": "Bogdan", "lastName": "Vujic", "seniority": "MEDIOR",
							    "department": { "id": 1, "name": "Engineering" }, "capacityPercent": 100, "load": 60, "free": 40 },
							  { "id": 7, "firstName": "Jelena", "lastName": "Petrovic", "seniority": "JUNIOR",
							    "department": { "id": 1, "name": "Engineering" }, "capacityPercent": 80, "load": 0, "free": 80 }
							]""")))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not an RM",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('RM')")
	@GetMapping("/me/team")
	public List<TeamMemberDto> myTeam(@AuthenticationPrincipal AuthUser user) {
		return userService.myTeam(user);
	}

	@Operation(summary = "Create an account with a temporary password (Admin)",
			description = "An EMPLOYEE needs a department and an active RM as manager. Other roles have no manager")
	@ApiResponse(responseCode = "201", description = "Created")
	@ApiResponse(responseCode = "400",
			description = "A field is missing or invalid, capacity is not 100, 80 or 50, or the department or "
					+ "manager is missing or wrong for the role",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "EMAIL_TAKEN: a user with this email exists (case is ignored)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public UserAccountDto create(@Valid @RequestBody CreateUserRequest request) {
		return userService.create(request);
	}

	@Operation(summary = "Edit an account (Admin)",
			description = "The same rules as create. The password is not changed")
	@ApiResponse(responseCode = "200", description = "Updated")
	@ApiResponse(responseCode = "400",
			description = "A field is missing or invalid, capacity is not 100, 80 or 50, or the department or "
					+ "manager is missing or wrong for the role",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No user with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "EMAIL_TAKEN: another user has this email (case is ignored). CAPACITY_EXCEEDED (BR-13): "
					+ "the lower capacity would be exceeded by existing active allocations, details lists the days. "
					+ "RM_HAS_TEAM: an RM with active employees can't get another role. USER_HAS_ACTIVE_ALLOCATIONS: "
					+ "an employee with allocations or proposals that haven't ended can't get another role. "
					+ "CANNOT_CHANGE_OWN_ROLE: your own account",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@PutMapping("/{id}")
	public UserAccountDto update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return userService.update(id, request, user);
	}

	@Operation(summary = "Deactivate an account (Admin)",
			description = "A deactivated user can't log in, and their tokens stop working. Deactivating an inactive "
					+ "user changes nothing")
	@ApiResponse(responseCode = "200", description = "Deactivated")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No user with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "USER_HAS_ACTIVE_ALLOCATIONS (BR-12): an APPROVED or CHANGE_PENDING allocation hasn't ended. "
					+ "RM_HAS_TEAM: the RM still has active employees. CANNOT_DEACTIVATE_SELF: your own account",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@PatchMapping("/{id}/deactivate")
	public UserAccountDto deactivate(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return userService.deactivate(id, user);
	}

}
