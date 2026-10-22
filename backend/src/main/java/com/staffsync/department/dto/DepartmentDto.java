package com.staffsync.department.dto;

import com.staffsync.department.Department;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A department that employees belong to")
public record DepartmentDto(@Schema(example = "1") Long id, @Schema(example = "Engineering") String name) {

	public static DepartmentDto from(Department department) {
		return new DepartmentDto(department.getId(), department.getName());
	}

}
