package com.staffsync.user.dto;

import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

/** {@link UserDto} plus the personal data shown on *My profile*. Read lazy fields inside a transaction. */
@Schema(description = "The current user with department, seniority, capacity and resource manager")
public record ProfileDto(@Schema(example = "4") Long id,
		@Schema(example = "bogdan_employee@staffsync.local") String email, @Schema(example = "Bogdan") String firstName,
		@Schema(example = "Vujic") String lastName, @Schema(example = "EMPLOYEE") Role role,
		@Schema(example = "Engineering", nullable = true) String department,
		@Schema(example = "MEDIOR", nullable = true) Seniority seniority, @Schema(example = "100") int capacityPercent,
		@Schema(nullable = true) ManagerDto manager,
		@Schema(example = "false", description = "True while the password is a temporary one from an Admin")
		boolean mustChangePassword) {

	public static ProfileDto from(User user) {
		return new ProfileDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName(), user.getRole(),
				user.getDepartment() != null ? user.getDepartment().getName() : null, user.getSeniority(),
				user.getCapacityPercent(), user.getManager() != null ? ManagerDto.from(user.getManager()) : null,
				user.isMustChangePassword());
	}

	@Schema(description = "The employee's resource manager")
	public record ManagerDto(@Schema(example = "3") Long id, @Schema(example = "Lazar") String firstName,
			@Schema(example = "Dunjic") String lastName) {

		static ManagerDto from(User manager) {
			return new ManagerDto(manager.getId(), manager.getFirstName(), manager.getLastName());
		}

	}

}
