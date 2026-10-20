package com.staffsync.user.dto;

import com.staffsync.user.Role;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Basic information about a user")
public record UserDto(@Schema(example = "4") Long id, @Schema(example = "employee@staffsync.local") String email,
		@Schema(example = "Marko") String firstName, @Schema(example = "Employee") String lastName,
		@Schema(example = "EMPLOYEE") Role role) {

	public static UserDto from(User user) {
		return new UserDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName(), user.getRole());
	}

}
