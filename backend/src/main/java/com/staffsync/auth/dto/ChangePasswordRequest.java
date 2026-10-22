package com.staffsync.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The current password and the one replacing it. 72 characters is the most BCrypt can hash.
 */
@Schema(description = "The current password and the new one")
public record ChangePasswordRequest(
		@Schema(example = "Password123!") @NotBlank(message = "Current password is required") String oldPassword,
		@Schema(example = "MyNewPassword2026!") @NotBlank(message = "New password is required") @Size(min = 8,
				max = 72, message = "New password must be 8 to 72 characters") String newPassword) {

}
