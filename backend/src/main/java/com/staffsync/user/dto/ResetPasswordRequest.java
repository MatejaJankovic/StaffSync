package com.staffsync.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "A new temporary password for a user who forgot theirs")
public record ResetPasswordRequest(
		@Schema(example = "Welcome2026!", description = "8 to 72 characters, and at most 72 bytes in UTF-8. The user "
				+ "has to replace it with their own at the next login")
		@NotBlank(message = "Temporary password is required") @Size(min = 8, max = 72,
				message = "Temporary password must be 8 to 72 characters") String temporaryPassword) {

}
