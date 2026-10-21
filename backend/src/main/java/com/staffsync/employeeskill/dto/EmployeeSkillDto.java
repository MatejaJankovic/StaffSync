package com.staffsync.employeeskill.dto;

import com.staffsync.employeeskill.EmployeeSkill;
import com.staffsync.skill.SkillCategory;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A skill an employee has rated")
public record EmployeeSkillDto(@Schema(example = "1") Long skillId, @Schema(example = "Java") String skillName,
		@Schema(example = "BACKEND") SkillCategory category, @Schema(example = "4") int level,
		@Schema(example = "3") int yearsOfExperience) {

	public static EmployeeSkillDto from(EmployeeSkill employeeSkill) {
		return new EmployeeSkillDto(employeeSkill.getSkill().getId(), employeeSkill.getSkill().getName(),
				employeeSkill.getSkill().getCategory(), employeeSkill.getLevel(), employeeSkill.getYearsOfExperience());
	}

}
