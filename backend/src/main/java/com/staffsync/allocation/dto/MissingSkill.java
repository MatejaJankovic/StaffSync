package com.staffsync.allocation.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** An entry of {@code details} for a 400 {@code MISSING_MANDATORY_SKILLS} (BR-9). */
@Schema(description = "A required skill of the request that the employee doesn't have at the minimum level")
public record MissingSkill(@Schema(example = "1") Long skillId, @Schema(example = "Java") String skillName,
		@Schema(example = "4") int minLevel,
		@Schema(example = "3", nullable = true, description = "The employee's level, null if they don't have the skill")
		Integer level) {

}
