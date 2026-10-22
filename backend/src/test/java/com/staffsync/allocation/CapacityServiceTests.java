package com.staffsync.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.user.Role;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

/**
 * Unit tests for {@link CapacityService} (§7). The spec scenarios T-01 – T-06 are QA's, so these
 * cover the mechanics around them. November 2026 starts on a Sunday, so the 2nd is a Monday.
 */
@ExtendWith(MockitoExtension.class)
class CapacityServiceTests {

	static final Long EMPLOYEE_ID = 1L;

	@Mock
	AllocationRepository allocationRepository;

	@Mock
	UserRepository userRepository;

	@InjectMocks
	CapacityService capacityService;

	@Test
	void onlyWorkingDaysEndUpInTheMap() {
		LocalDate friday = nov(6);
		LocalDate monday = nov(9);
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, friday, monday, AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(approved(50, nov(2), nov(13))));

		Map<LocalDate, Integer> load = capacityService.getDailyLoad(EMPLOYEE_ID, friday, monday, null);

		assertThat(load).containsExactly(Map.entry(friday, 50), Map.entry(monday, 50));
	}

	@Test
	void aWeekendOnlyPeriodHasNoDays() {
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(7), nov(8), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of());

		assertThat(capacityService.getDailyLoad(EMPLOYEE_ID, nov(7), nov(8), null)).isEmpty();
	}

	@Test
	void aFreeWorkingDayIsInTheMapWithZero() {
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(9), nov(11), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(approved(40, nov(10), nov(10))));

		Map<LocalDate, Integer> load = capacityService.getDailyLoad(EMPLOYEE_ID, nov(9), nov(11), null);

		assertThat(load).containsExactly(Map.entry(nov(9), 0), Map.entry(nov(10), 40), Map.entry(nov(11), 0));
	}

	@Test
	void allocationsAreClippedToTheRequestedPeriodAndSummed() {
		Allocation startsBefore = approved(40, nov(2), nov(20));
		Allocation endsAfter = approved(30, nov(10), LocalDate.of(2026, 12, 31));
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(9), nov(11), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(startsBefore, endsAfter));

		Map<LocalDate, Integer> load = capacityService.getDailyLoad(EMPLOYEE_ID, nov(9), nov(11), null);

		assertThat(load).containsExactly(Map.entry(nov(9), 40), Map.entry(nov(10), 70), Map.entry(nov(11), 70));
	}

	@Test
	void changePendingCountsWithItsCurrentValuesNeverThePendingOnes() {
		Allocation allocation = approved(60, nov(2), nov(6));
		allocation.requestChange(90, nov(2), nov(13), "Client extended the sprint");
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(2), nov(13), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(allocation));

		Map<LocalDate, Integer> load = capacityService.getDailyLoad(EMPLOYEE_ID, nov(2), nov(13), null);

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.CHANGE_PENDING);
		assertThat(load).hasSize(10);
		assertThat(load.get(nov(6))).isEqualTo(60);
		assertThat(load.get(nov(9))).isZero();
		assertThat(load.values()).doesNotContain(90);
	}

	@Test
	void excludeAllocationIdIsPassedToTheRepository() {
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(2), nov(6), AllocationStatus.ACTIVE, 42L))
			.thenReturn(List.of());

		capacityService.getDailyLoad(EMPLOYEE_ID, nov(2), nov(6), 42L);

		verify(allocationRepository).findOverlapping(EMPLOYEE_ID, nov(2), nov(6), AllocationStatus.ACTIVE, 42L);
	}

	@Test
	void theProposedVariantAlsoAsksForProposedAllocations() {
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(2), nov(6), AllocationStatus.ACTIVE_OR_PROPOSED,
				null))
			.thenReturn(List.of(approved(50, nov(2), nov(6)), proposed(30, nov(2), nov(6))));

		Map<LocalDate, Integer> load = capacityService.getDailyLoadIncludingProposed(EMPLOYEE_ID, nov(2), nov(6), null);

		assertThat(load.values()).containsOnly(80);
	}

	@Test
	void freeCapacityIsCapacityPercentMinusLoad() {
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee(80)));
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(9), nov(10), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(approved(30, nov(10), nov(10))));

		Map<LocalDate, Integer> free = capacityService.getFreeCapacity(EMPLOYEE_ID, nov(9), nov(10));

		assertThat(free).containsExactly(Map.entry(nov(9), 80), Map.entry(nov(10), 50));
	}

	@Test
	void checkCapacityThrows409WithTheOverloadedDays() {
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee(100)));
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(9), nov(11), AllocationStatus.ACTIVE, 7L))
			.thenReturn(List.of(approved(50, nov(2), nov(10))));

		assertThatThrownBy(() -> capacityService.checkCapacity(EMPLOYEE_ID, nov(9), nov(11), 60, 7L))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo(CapacityService.CAPACITY_EXCEEDED);
				assertThat(ex.getDetails()).isEqualTo(List.of(Map.of("date", nov(9), "load", 110),
						Map.of("date", nov(10), "load", 110)));
			});
	}

	@Test
	void checkCapacityMessageMergesConsecutiveDaysWithTheSameLoad() {
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee(100)));
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(2), nov(20), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(approved(60, nov(2), nov(13)), approved(50, nov(16), nov(20))));

		// The weekend of 7–8 Nov doesn't break the first run, a different load starts a new one
		assertThatThrownBy(() -> capacityService.checkCapacity(EMPLOYEE_ID, nov(2), nov(20), 60, null))
			.isInstanceOf(BusinessException.class)
			.hasMessage("Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120%); "
					+ "2026-11-16 – 2026-11-20 (50% existing + 60% new = 110%)");
	}

	@Test
	void checkCapacityIgnoresProposedAllocations() {
		// The repository filters by status like the real query, so the proposed 50% only counts if asked for
		Allocation existing = proposed(50, nov(9), nov(11));
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee(100)));
		when(allocationRepository.findOverlapping(eq(EMPLOYEE_ID), eq(nov(9)), eq(nov(11)), any(), isNull()))
			.thenAnswer(call -> {
				Collection<AllocationStatus> statuses = call.getArgument(3);
				return statuses.contains(existing.getStatus()) ? List.of(existing) : List.of();
			});

		// 50% proposed + 60% new = 110% would be over, but only as a soft-booking warning (BR-2)
		assertThat(capacityService.findOverloadedDays(EMPLOYEE_ID, nov(9), nov(11), 60, null, true)).hasSize(3);
		assertThatNoException().isThrownBy(() -> capacityService.checkCapacity(EMPLOYEE_ID, nov(9), nov(11), 60, null));
	}

	@Test
	void findOverloadedDaysIsEmptyWhenTheAllocationFits() {
		when(userRepository.findById(EMPLOYEE_ID)).thenReturn(Optional.of(employee(50)));
		when(allocationRepository.findOverlapping(EMPLOYEE_ID, nov(2), nov(6), AllocationStatus.ACTIVE, null))
			.thenReturn(List.of(approved(20, nov(2), nov(6))));

		assertThat(capacityService.findOverloadedDays(EMPLOYEE_ID, nov(2), nov(6), 30, null, false)).isEmpty();
	}

	@Test
	void anUnknownEmployeeIsNotFound() {
		when(userRepository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> capacityService.checkCapacity(99L, nov(2), nov(6), 50, null))
			.isInstanceOfSatisfying(NotFoundException.class,
					ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
		verify(allocationRepository, never()).findOverlapping(any(), any(), any(), any(), any());
	}

	@Test
	void aPeriodThatEndsBeforeItStartsIsRejected() {
		assertThatThrownBy(() -> capacityService.getDailyLoad(EMPLOYEE_ID, nov(10), nov(9), null))
			.isInstanceOf(IllegalArgumentException.class);
	}

	static LocalDate nov(int day) {
		return LocalDate.of(2026, 11, day);
	}

	static User employee(int capacityPercent) {
		User user = new User("dev@staffsync.local", "hash", "First", "Last", Role.EMPLOYEE);
		user.setCapacityPercent(capacityPercent);
		return user;
	}

	static Allocation approved(int percent, LocalDate start, LocalDate end) {
		Allocation allocation = proposed(percent, start, end);
		allocation.setStatus(AllocationStatus.APPROVED);
		return allocation;
	}

	// The request and the PM don't matter for capacity, so they stay null
	static Allocation proposed(int percent, LocalDate start, LocalDate end) {
		return new Allocation(null, null, percent, start, end, null);
	}

}
