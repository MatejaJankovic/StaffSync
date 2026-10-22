package com.staffsync.department.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Data for creating or renaming a department")
public record DepartmentRequest(@Schema(example = "Engineering") @NotBlank(message = "Name is required") @Size(max = 100,
		message = "Name must be at most 100 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
				message = "Name must not contain control characters") String name) {

}
