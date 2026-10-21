package com.staffsync.project.dto;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Data for creating or updating a project. The status is not part of it: a new project is "
		+ "PLANNED, and the status is changed separately")
public record ProjectRequest(
		@Schema(example = "Project Alpha") @NotBlank(message = "Name is required") @Size(max = 200,
				message = "Name must be at most 200 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
						message = "Name must not contain control characters") String name,
		@Schema(example = "Acme Corp") @NotBlank(message = "Client is required") @Size(max = 200,
				message = "Client must be at most 200 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
						message = "Client must not contain control characters") String client,
		@Schema(example = "Customer portal rebuild", nullable = true) @Size(max = 2000,
				message = "Description must be at most 2000 characters") String description,
		@Schema(example = "2026-11-01") @NotNull(message = "Start date is required") LocalDate startDate,
		@Schema(example = "2027-03-31") @NotNull(message = "End date is required") LocalDate endDate) {

}
