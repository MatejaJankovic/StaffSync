package com.staffsync.request.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@Schema(description = "A skill the request asks for. Each skill can appear once per request")
public record RequestSkillRequest(
		@Schema(example = "1", description = "Id from the skills catalog") @NotNull(message = "Skill is required") Long skillId,
		@Schema(example = "4", description = "Minimum level, 1 to 5") @NotNull(message = "Minimum level is required") @Min(
				value = 1, message = "Minimum level must be between 1 and 5") @Max(value = 5,
						message = "Minimum level must be between 1 and 5") Integer minLevel,
		@Schema(example = "true", description = "true = required, false = nice to have") @NotNull(
				message = "Mandatory is required") Boolean mandatory) {

}
