package com.staffsync.project.dto;

import java.time.LocalDate;

import com.staffsync.project.Project;
import com.staffsync.project.ProjectStatus;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A project and the Project Manager who owns it")
public record ProjectDto(@Schema(example = "1") Long id, @Schema(example = "Project Alpha") String name,
		@Schema(example = "Acme Corp") String client,
		@Schema(example = "Customer portal rebuild", nullable = true) String description,
		@Schema(example = "2026-11-01") LocalDate startDate, @Schema(example = "2027-03-31") LocalDate endDate,
		@Schema(example = "PLANNED") ProjectStatus status, @Schema(example = "2") Long pmId,
		@Schema(example = "Mateja Jankovic") String pmName) {

	public static ProjectDto from(Project project) {
		return new ProjectDto(project.getId(), project.getName(), project.getClient(), project.getDescription(),
				project.getStartDate(), project.getEndDate(), project.getStatus(), project.getPm().getId(),
				project.getPm().getFirstName() + " " + project.getPm().getLastName());
	}

}
