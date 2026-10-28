package com.staffsync.allocation.dto;

import java.time.Instant;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.allocation.CapacityService;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "An allocation waiting for the RM's decision (BR-7). For a NEW proposal the allocation's percent "
		+ "and period are what the RM approves. For a CHANGE they are the current values, still in force (BR-16), and "
		+ "pendingPercent, pendingStartDate, pendingEndDate and changeReason hold what the PM asks for (BR-15)")
public record PendingApprovalDto(
		@Schema(example = "NEW", description = "NEW for a PROPOSED allocation, CHANGE for a CHANGE_PENDING one") Type type,
		AllocationDto allocation, @Schema(example = "2", description = "The PM who proposed the employee") Long proposedById,
		@Schema(example = "Mateja Jankovic") String proposedByName,
		@Schema(example = "2026-10-22T09:15:30Z", description = "Since when the decision is awaited: when the change "
				+ "was requested for a CHANGE, when the allocation was proposed for a NEW one") Instant awaitingSince,
		@Schema(example = "100", description = "The employee's capacity %") int capacityPercent,
		@Schema(example = "120", description = "The highest daily load % if the RM approves (the new values replace "
				+ "the current ones for a CHANGE)") int peakLoad,
		@Schema(example = "10", description = "On how many working days approving would go over capacity. More "
				+ "than 0 means Approve answers 409 CAPACITY_EXCEEDED (BR-1)") int overCapacityDays) {

	/** What the RM decides on: a new proposal or a change to an approved allocation. */
	public enum Type {

		NEW, CHANGE

	}

	public static PendingApprovalDto from(Allocation allocation, CapacityService.LoadPreview preview) {
		User proposedBy = allocation.getProposedBy();
		Type type = allocation.getStatus() == AllocationStatus.CHANGE_PENDING ? Type.CHANGE : Type.NEW;
		return new PendingApprovalDto(type, AllocationDto.from(allocation), proposedBy.getId(),
				proposedBy.getFirstName() + " " + proposedBy.getLastName(), allocation.getAwaitingSince(),
				preview.capacityPercent(), preview.peakLoad(), preview.overCapacityDays());
	}

}
