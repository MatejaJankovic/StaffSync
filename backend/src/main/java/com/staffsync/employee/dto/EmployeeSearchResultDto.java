package com.staffsync.employee.dto;

import java.util.List;

import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

/** An employee found by *Employee search*, with their load on today's working day, as *My team* shows it. */
@Schema(description = "An employee found by the search, with the searched skill's level, their main skills and "
		+ "today's free capacity")
public record EmployeeSearchResultDto(@Schema(example = "4") Long id, @Schema(example = "Bogdan") String firstName,
		@Schema(example = "Vujic") String lastName, @Schema(example = "MEDIOR", nullable = true) Seniority seniority,
		@Schema(nullable = true) DepartmentDto department,
		@Schema(description = "The level of the searched skill (skillId). Null when the search has no skill",
				example = "4", nullable = true) Integer skillLevel,
		@Schema(description = "The employee's main skills: at most 3, highest level first, then by name")
		List<SkillLevelDto> topSkills, @Schema(example = "100") int capacityPercent,
		@Schema(description = "Today's load % from APPROVED and CHANGE_PENDING allocations", example = "60") int load,
		@Schema(description = "capacityPercent − load. Negative only if the data is already overbooked",
				example = "40") int free) {

	public static EmployeeSearchResultDto from(User user, Integer skillLevel, List<SkillLevelDto> topSkills,
			int load) {
		return new EmployeeSearchResultDto(user.getId(), user.getFirstName(), user.getLastName(), user.getSeniority(),
				user.getDepartment() != null ? DepartmentDto.from(user.getDepartment()) : null, skillLevel, topSkills,
				user.getCapacityPercent(), load, user.getCapacityPercent() - load);
	}

}
