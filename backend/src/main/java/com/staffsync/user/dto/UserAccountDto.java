package com.staffsync.user.dto;

import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.dto.ProfileDto.ManagerDto;
import io.swagger.v3.oas.annotations.media.Schema;

/** A user as the *Users* page shows it. Never carries the password hash. Read lazy fields inside a transaction. */
@Schema(description = "A user account with department, resource manager, seniority, capacity and active flag")
public record UserAccountDto(@Schema(example = "4") Long id,
		@Schema(example = "bogdan_employee@staffsync.local") String email, @Schema(example = "Bogdan") String firstName,
		@Schema(example = "Vujic") String lastName, @Schema(example = "EMPLOYEE") Role role,
		@Schema(nullable = true) DepartmentDto department, @Schema(nullable = true) ManagerDto manager,
		@Schema(example = "MEDIOR", nullable = true) Seniority seniority, @Schema(example = "100") int capacityPercent,
		@Schema(example = "true") boolean active) {

	public static UserAccountDto from(User user) {
		return new UserAccountDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName(),
				user.getRole(), user.getDepartment() != null ? DepartmentDto.from(user.getDepartment()) : null,
				user.getManager() != null ? ManagerDto.from(user.getManager()) : null, user.getSeniority(),
				user.getCapacityPercent(), user.isActive());
	}

}
