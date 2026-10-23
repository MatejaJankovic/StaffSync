package com.staffsync.employee.dto;

import com.staffsync.employeeskill.EmployeeSkill;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "One of the employee's skills and their level")
public record SkillLevelDto(@Schema(example = "3") Long skillId, @Schema(example = "Java") String name,
		@Schema(description = "1 to 5", example = "4") int level) {

	public static SkillLevelDto from(EmployeeSkill rating) {
		return new SkillLevelDto(rating.getSkill().getId(), rating.getSkill().getName(), rating.getLevel());
	}

}
