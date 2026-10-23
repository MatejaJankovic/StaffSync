package com.staffsync.employee;

import java.time.LocalDate;

import com.staffsync.user.Seniority;

/**
 * The filters of an employee search. Every one is optional, and they combine with AND. {@code minLevel} needs a
 * {@code skillId}, and {@code availableFrom}, {@code availableTo} and {@code minFreePercent} go together.
 */
public record EmployeeSearchFilters(Long skillId, Integer minLevel, Seniority seniority, Long departmentId,
		LocalDate availableFrom, LocalDate availableTo, Integer minFreePercent) {

	boolean filtersOnAvailability() {
		return availableFrom != null && availableTo != null && minFreePercent != null;
	}

}
