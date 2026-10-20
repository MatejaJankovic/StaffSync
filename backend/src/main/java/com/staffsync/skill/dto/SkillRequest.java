package com.staffsync.skill.dto;

import com.staffsync.skill.SkillCategory;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Data for creating or updating a skill")
public record SkillRequest(
		@Schema(example = "Java") @NotBlank(message = "Name is required") @Size(max = 100,
				message = "Name must be at most 100 characters") String name,
		@Schema(example = "BACKEND") @NotNull(message = "Category is required") SkillCategory category) {

}
