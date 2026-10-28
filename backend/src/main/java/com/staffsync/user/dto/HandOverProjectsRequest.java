package com.staffsync.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

@Schema(description = "The project manager who takes over the open projects")
public record HandOverProjectsRequest(
		@Schema(example = "6", description = "An active PM other than the current one") @NotNull(
				message = "The new project manager is required") Long toPmId) {

}
