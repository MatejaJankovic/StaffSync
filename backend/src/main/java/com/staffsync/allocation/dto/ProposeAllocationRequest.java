package com.staffsync.allocation.dto;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@Schema(description = "A PM proposes an employee for a staffing request. The percent and the period are optional and "
		+ "default to the request's",
		example = """
				{
				  "requestId": 1,
				  "employeeId": 4,
				  "percent": 60,
				  "startDate": "2026-11-01",
				  "endDate": "2027-01-31"
				}""")
public record ProposeAllocationRequest(
		@Schema(example = "1", description = "The staffing request to fill") @NotNull(
				message = "Request is required") Long requestId,
		@Schema(example = "4", description = "The employee to propose") @NotNull(
				message = "Employee is required") Long employeeId,
		@Schema(example = "60", nullable = true,
				description = "10 to 100, in steps of 10. Default: the request's allocation") @Min(value = 10,
						message = "Percent must be between 10 and 100") @Max(value = 100,
								message = "Percent must be between 10 and 100") Integer percent,
		@Schema(example = "2026-11-01", nullable = true,
				description = "Default: the request's start date") LocalDate startDate,
		@Schema(example = "2027-01-31", nullable = true,
				description = "Default: the request's end date") LocalDate endDate) {

}
