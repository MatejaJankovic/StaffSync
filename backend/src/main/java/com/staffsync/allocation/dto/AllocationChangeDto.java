package com.staffsync.allocation.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "The allocation, now CHANGE_PENDING with the requested values in pending*, and the soft-booking "
		+ "warnings for those values (BR-2). A warning never blocks the request: capacity is enforced when the RM "
		+ "approves the change (BR-1)")
public record AllocationChangeDto(AllocationDto allocation,
		@Schema(example = "[\"Capacity would be exceeded on 2026-11-02 – 2026-11-13 (110%)\"]",
				description = "Empty when the employee has enough capacity for the new values") List<String> warnings) {

}
