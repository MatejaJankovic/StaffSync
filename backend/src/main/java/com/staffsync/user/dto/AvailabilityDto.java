package com.staffsync.user.dto;

import java.time.LocalDate;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** An employee's load and free capacity per working day of a period (§7, US-16). */
@Schema(description = "An employee's capacity and one entry per working day (Mon–Fri) of the period")
public record AvailabilityDto(@Schema(example = "4") Long employeeId, @Schema(example = "100") int capacityPercent,
		@Schema(example = "2026-11-05") LocalDate from, @Schema(example = "2026-11-20") LocalDate to,
		@Schema(description = "Working days only, in date order") List<DayAvailabilityDto> days) {

}
