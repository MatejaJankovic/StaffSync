package com.staffsync.request.dto;

import java.time.LocalDate;
import java.util.List;

import com.staffsync.user.Seniority;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Data for creating or updating a staffing request. The status is not part of it: a new "
		+ "request is OPEN, and the status is calculated from the allocations. On an update the skills replace the "
		+ "current ones",
		example = """
				{
				  "title": "Java Developer",
				  "seniority": "MEDIOR",
				  "allocationPercent": 60,
				  "startDate": "2026-11-01",
				  "endDate": "2027-01-31",
				  "headcount": 2,
				  "skills": [
				    { "skillId": 1, "minLevel": 4, "mandatory": true },
				    { "skillId": 2, "minLevel": 3, "mandatory": true },
				    { "skillId": 12, "minLevel": 2, "mandatory": false }
				  ]
				}""")
public record StaffingRequestRequest(
		@Schema(example = "Java Developer") @NotBlank(message = "Title is required") @Size(max = 200,
				message = "Title must be at most 200 characters") @Pattern(regexp = "[^\\p{Cntrl}]*",
						message = "Title must not contain control characters") String title,
		@Schema(example = "MEDIOR") @NotNull(message = "Seniority is required") Seniority seniority,
		@Schema(example = "60", description = "10 to 100, in steps of 10") @NotNull(
				message = "Allocation is required") @Min(value = 10, message = "Allocation must be between 10 and 100") @Max(
						value = 100, message = "Allocation must be between 10 and 100") Integer allocationPercent,
		@Schema(example = "2026-11-01") @NotNull(message = "Start date is required") LocalDate startDate,
		@Schema(example = "2027-01-31") @NotNull(message = "End date is required") LocalDate endDate,
		@Schema(example = "2") @NotNull(message = "Headcount is required") @Min(value = 1,
				message = "Headcount must be at least 1") Integer headcount,
		@Schema(description = "The skills the request asks for, which can be empty") @NotNull(
				message = "Skills are required, use an empty list for none") @Size(max = 30,
						message = "A request can ask for at most 30 skills") List<@Valid @NotNull(
								message = "Skill must not be null") RequestSkillRequest> skills) {

}
