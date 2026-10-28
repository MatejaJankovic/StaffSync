package com.staffsync.request.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.user.Seniority;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A staffing request of a project, with the skills it asks for")
public record StaffingRequestDto(@Schema(example = "1") Long id, @Schema(example = "1") Long projectId,
		@Schema(example = "Java Developer") String title, @Schema(example = "MEDIOR") Seniority seniority,
		@Schema(example = "60") int allocationPercent, @Schema(example = "2026-11-01") LocalDate startDate,
		@Schema(example = "2027-01-31") LocalDate endDate, @Schema(example = "2") int headcount,
		@Schema(example = "1", description = "How many different people have an active allocation on it (BR-10)")
		int filled, @Schema(example = "PARTIALLY_FILLED") RequestStatus status,
		@Schema(example = "2026-10-21T09:15:30Z") Instant createdAt, List<RequestSkillDto> skills) {

	/** {@code filled} is the number of people with an active allocation, see {@code RequestStatusService}. */
	public static StaffingRequestDto from(StaffingRequest request, long filled) {
		return new StaffingRequestDto(request.getId(), request.getProject().getId(), request.getTitle(),
				request.getSeniority(), request.getAllocationPercent(), request.getStartDate(), request.getEndDate(),
				request.getHeadcount(), (int) filled, request.getStatus(), request.getCreatedAt(),
				request.getSkills().stream().map(RequestSkillDto::from).toList());
	}

}
