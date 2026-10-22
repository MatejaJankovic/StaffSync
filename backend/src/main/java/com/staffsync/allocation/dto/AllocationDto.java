package com.staffsync.allocation.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.user.User;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "An employee allocated to a staffing request. The pending* fields and changeReason are set only "
		+ "while the status is CHANGE_PENDING (BR-15)")
public record AllocationDto(@Schema(example = "1") Long id, @Schema(example = "4") Long employeeId,
		@Schema(example = "Bogdan Vujic") String employeeName, @Schema(example = "1") Long projectId,
		@Schema(example = "Project Alpha") String projectName, @Schema(example = "1") Long requestId,
		@Schema(example = "Java Developer") String requestTitle, @Schema(example = "60") int percent,
		@Schema(example = "2026-11-01") LocalDate startDate, @Schema(example = "2027-01-31") LocalDate endDate,
		@Schema(example = "PROPOSED") AllocationStatus status,
		@Schema(example = "2026-10-22T09:15:30Z") Instant createdAt,
		@Schema(example = "80", nullable = true) Integer pendingPercent,
		@Schema(example = "2026-11-01", nullable = true) LocalDate pendingStartDate,
		@Schema(example = "2027-01-31", nullable = true) LocalDate pendingEndDate,
		@Schema(example = "The client asked for more work", nullable = true) String changeReason) {

	public static AllocationDto from(Allocation allocation) {
		User employee = allocation.getEmployee();
		return new AllocationDto(allocation.getId(), employee.getId(),
				employee.getFirstName() + " " + employee.getLastName(), allocation.getRequest().getProject().getId(),
				allocation.getRequest().getProject().getName(), allocation.getRequest().getId(),
				allocation.getRequest().getTitle(), allocation.getPercent(), allocation.getStartDate(),
				allocation.getEndDate(), allocation.getStatus(), allocation.getCreatedAt(),
				allocation.getPendingPercent(), allocation.getPendingStartDate(), allocation.getPendingEndDate(),
				allocation.getChangeReason());
	}

}
