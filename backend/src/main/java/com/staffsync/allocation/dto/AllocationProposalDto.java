package com.staffsync.allocation.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "The new PROPOSED allocation, and the soft-booking warnings (BR-2). A warning never blocks the "
		+ "proposal: capacity is enforced when the RM approves (BR-1)")
public record AllocationProposalDto(AllocationDto allocation,
		@Schema(example = "[\"Capacity would be exceeded on 2026-11-02 – 2026-11-13 (120%)\"]",
				description = "Empty when the employee has enough capacity") List<String> warnings) {

}
