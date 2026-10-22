package com.staffsync.user.dto;

import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Data for a new account. An EMPLOYEE needs a department and an active RM as manager; other roles
 * have no manager. {@code capacityPercent} must be 100, 80 or 50.
 */
@Schema(description = "Data for a new user account with a temporary password")
public record CreateUserRequest(
		@Schema(example = "jelena_employee@staffsync.local") @NotBlank(message = "Email is required") @Email(
				message = "Email must be a valid email address") @Size(max = 255,
						message = "Email must be at most 255 characters") String email,
		@Schema(example = "Jelena") @NotBlank(message = "First name is required") @Size(max = 100,
				message = "First name must be at most 100 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
						message = "First name must not contain control characters") String firstName,
		@Schema(example = "Petrovic") @NotBlank(message = "Last name is required") @Size(max = 100,
				message = "Last name must be at most 100 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
						message = "Last name must not contain control characters") String lastName,
		@Schema(example = "EMPLOYEE") @NotNull(message = "Role is required") Role role,
		@Schema(example = "1", description = "Required for an EMPLOYEE", nullable = true) Long departmentId,
		@Schema(example = "3", description = "The resource manager: required for an EMPLOYEE, empty for other roles",
				nullable = true) Long managerId,
		@Schema(example = "MEDIOR", nullable = true) Seniority seniority,
		@Schema(example = "100", allowableValues = { "100", "80", "50" }) @NotNull(
				message = "Capacity is required") Integer capacityPercent,
		@Schema(example = "Welcome2026!", description = "8 to 72 characters, and at most 72 bytes in UTF-8 (an accented "
				+ "letter is 2). Stored as a BCrypt hash. The user changes it after logging in")
		@NotBlank(message = "Temporary password is required") @Size(min = 8, max = 72,
				message = "Temporary password must be 8 to 72 characters") String temporaryPassword)
		implements UserFields {

}
