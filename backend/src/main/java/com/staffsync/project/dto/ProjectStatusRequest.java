package com.staffsync.project.dto;

import com.staffsync.project.ProjectStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

@Schema(description = "The PM moves their project to its next status (§9). COMPLETED and CANCELLED run the "
		+ "BR-11 clean-up",
		example = """
				{
				  "status": "ACTIVE"
				}""")
public record ProjectStatusRequest(
		@Schema(example = "ACTIVE",
				description = "PLANNED → ACTIVE → COMPLETED, or PLANNED / ACTIVE → CANCELLED") @NotNull(
						message = "Status is required") ProjectStatus status) {

}
