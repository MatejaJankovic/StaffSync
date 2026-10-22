package com.staffsync.dashboard.dto;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "One number card on the Home page (§11). The value is already formatted, e.g. \"60%\" or "
		+ "\"3\", or a project name for the next allocation")
public record DashboardCardDto(@Schema(example = "pendingDecisions") String key,
		@Schema(example = "Decisions waiting for me") String label, @Schema(example = "3") String value,
		@Schema(description = "Only for the employee's next allocation: the day it starts", example = "2026-11-01",
				nullable = true) LocalDate date,
		@Schema(description = "The frontend route of the related list, or null if there is none",
				example = "/approvals", nullable = true) String link) {

	public static DashboardCardDto of(String key, String label, String value, String link) {
		return new DashboardCardDto(key, label, value, null, link);
	}

}
