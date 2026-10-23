package com.staffsync.allocation.dto;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "A PM asks to change an approved allocation (BR-15). The percent and the dates are optional and "
		+ "keep their current value when left out, but at least one of them must change. The reason is required",
		example = """
				{
				  "percent": 80,
				  "reason": "The client asked for more work on the reporting module"
				}""")
public record ChangeAllocationRequest(
		@Schema(example = "80", nullable = true,
				description = "10 to 100, in steps of 10. Default: the current percent") @Min(value = 10,
						message = "Percent must be between 10 and 100") @Max(value = 100,
								message = "Percent must be between 10 and 100") Integer percent,
		@Schema(example = "2026-11-01", nullable = true,
				description = "Default: the current start date. Can't change once the allocation has started")
		LocalDate startDate,
		@Schema(example = "2027-01-31", nullable = true, description = "Default: the current end date")
		LocalDate endDate,
		@Schema(example = "The client asked for more work on the reporting module",
				description = "Why the change is needed. 10 to 1000 characters, without the surrounding spaces") @NotBlank(
						message = "Reason is required") @Size(min = 10, max = 1000,
								message = "Reason must be between 10 and 1000 characters") String reason) {

}
