package com.staffsync.user.dto;

import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

/** A member of the RM's team as *My team* shows it, with their load on today's working day. */
@Schema(description = "A team member with capacity, today's load % and free %")
public record TeamMemberDto(@Schema(example = "4") Long id, @Schema(example = "Bogdan") String firstName,
		@Schema(example = "Vujic") String lastName, @Schema(example = "MEDIOR", nullable = true) Seniority seniority,
		@Schema(nullable = true) DepartmentDto department, @Schema(example = "100") int capacityPercent,
		@Schema(description = "Today's load % from APPROVED and CHANGE_PENDING allocations", example = "60") int load,
		@Schema(description = "capacityPercent − load. Negative only if the data is already overbooked",
				example = "40") int free) {

	public static TeamMemberDto from(User user, int load) {
		return new TeamMemberDto(user.getId(), user.getFirstName(), user.getLastName(), user.getSeniority(),
				user.getDepartment() != null ? DepartmentDto.from(user.getDepartment()) : null,
				user.getCapacityPercent(), load, user.getCapacityPercent() - load);
	}

}
