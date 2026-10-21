package com.staffsync.skill.dto;

import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillCategory;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A skill from the catalog")
public record SkillDto(@Schema(example = "1") Long id, @Schema(example = "Java") String name,
		@Schema(example = "BACKEND") SkillCategory category) {

	public static SkillDto from(Skill skill) {
		return new SkillDto(skill.getId(), skill.getName(), skill.getCategory());
	}

}
