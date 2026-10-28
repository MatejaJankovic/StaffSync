package com.staffsync.user.dto;

import com.staffsync.user.Role;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Basic information about a user")
public record UserDto(@Schema(example = "4") Long id, @Schema(example = "bogdan_employee@staffsync.local") String email,
		@Schema(example = "Bogdan") String firstName, @Schema(example = "Vujic") String lastName,
		@Schema(example = "EMPLOYEE") Role role,
		@Schema(example = "false", description = "True while the password is a temporary one from an Admin: the "
				+ "user has to choose their own before doing anything else") boolean mustChangePassword) {

	public static UserDto from(User user) {
		return new UserDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName(), user.getRole(),
				user.isMustChangePassword());
	}

}
