package com.staffsync.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "Email and password of the user logging in")
public record LoginRequest(@Schema(example = "admin@staffsync.local") @NotBlank @Email String email,
		@Schema(example = "Password123!") @NotBlank String password) {

}
