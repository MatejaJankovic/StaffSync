package com.staffsync.auth.dto;

import com.staffsync.common.MaxBytes;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The current password and the one replacing it. BCrypt hashes at most 72 bytes, so the limit
 * is in bytes and not characters.
 */
@Schema(description = "The current password and the new one")
public record ChangePasswordRequest(
		@Schema(example = "Password123!") @NotBlank(message = "Current password is required") String oldPassword,
		@Schema(example = "MyNewPassword2026!",
				description = "At least 8 characters and at most 72 bytes in UTF-8 (letters such as č or ž count as 2)")
		@NotBlank(message = "New password is required")
		@Size(min = 8, message = "New password must be at least 8 characters")
		@MaxBytes(value = 72,
				message = "New password must be at most 72 bytes (letters such as č or ž count as 2)") String newPassword) {

}
