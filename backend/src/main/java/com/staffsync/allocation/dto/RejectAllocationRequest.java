package com.staffsync.allocation.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "The RM rejects a proposed allocation, and says why (BR-6)",
		example = """
				{
				  "comment": "Fully booked on Project Beta until December"
				}""")
public record RejectAllocationRequest(
		@Schema(example = "Fully booked on Project Beta until December",
				description = "Why the allocation is rejected. 10 to 1000 characters, without the surrounding spaces (BR-6)") @NotBlank(
						message = "Comment is required") @Size(min = 10, max = 1000,
								message = "Comment must be between 10 and 1000 characters") String comment) {

}
