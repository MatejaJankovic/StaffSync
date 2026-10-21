package com.staffsync.employeeskill.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@Schema(description = "One skill in the employee's list, with its level and years of experience")
public record EmployeeSkillRequest(@Schema(example = "1") @NotNull(message = "Skill is required") Long skillId,
		@Schema(example = "4", minimum = "1", maximum = "5") @NotNull(message = "Level is required") @Min(value = 1,
				message = "Level must be between 1 and 5") @Max(value = 5,
						message = "Level must be between 1 and 5") Integer level,
		@Schema(example = "3", minimum = "0") @NotNull(message = "Years of experience is required") @Min(value = 0,
				message = "Years of experience must not be negative") @Max(value = 60,
						message = "Years of experience must be at most 60") Integer yearsOfExperience) {

}
