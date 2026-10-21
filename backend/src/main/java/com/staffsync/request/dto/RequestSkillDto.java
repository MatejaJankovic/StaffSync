package com.staffsync.request.dto;

import com.staffsync.request.RequestSkill;
import com.staffsync.skill.SkillCategory;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A skill a staffing request asks for")
public record RequestSkillDto(@Schema(example = "1") Long skillId, @Schema(example = "Java") String skillName,
		@Schema(example = "BACKEND") SkillCategory category, @Schema(example = "4") int minLevel,
		@Schema(example = "true", description = "true = required, false = nice to have") boolean mandatory) {

	public static RequestSkillDto from(RequestSkill skill) {
		return new RequestSkillDto(skill.getSkill().getId(), skill.getSkill().getName(),
				skill.getSkill().getCategory(), skill.getMinLevel(), skill.isMandatory());
	}

}
