package com.staffsync.user.dto;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

/** One working day of an employee's availability (§7). */
@Schema(description = "A working day with the load % and free %")
public record DayAvailabilityDto(@Schema(example = "2026-11-10") LocalDate date,
		@Schema(description = "Load % from APPROVED and CHANGE_PENDING allocations", example = "90") int load,
		@Schema(description = "capacityPercent − load. Negative only if the data is already overbooked",
				example = "10") int free) {

}
