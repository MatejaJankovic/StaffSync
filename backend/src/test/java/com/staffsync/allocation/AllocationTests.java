package com.staffsync.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

/** Unit tests for the change flow on {@link Allocation} (BR-15). */
class AllocationTests {

	static final LocalDate START = LocalDate.of(2026, 11, 2);

	static final LocalDate END = LocalDate.of(2026, 11, 13);

	@Test
	void aChangeRequestKeepsTheCurrentValuesUntilItIsApplied() {
		Allocation allocation = approved();

		allocation.requestChange(80, START, END.plusDays(7), "Client extended the sprint");

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.CHANGE_PENDING);
		assertThat(allocation.isActive()).isTrue();
		assertThat(allocation.getPercent()).isEqualTo(60);
		assertThat(allocation.getEndDate()).isEqualTo(END);
		assertThat(allocation.getPendingPercent()).isEqualTo(80);
		assertThat(allocation.getPendingEndDate()).isEqualTo(END.plusDays(7));
	}

	@Test
	void applyingTheChangeTakesThePendingValuesAndGoesBackToApproved() {
		Allocation allocation = approved();
		allocation.requestChange(80, START, END.plusDays(7), "Client extended the sprint");

		allocation.applyPendingChange();

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(allocation.getPercent()).isEqualTo(80);
		assertThat(allocation.getEndDate()).isEqualTo(END.plusDays(7));
		assertThat(allocation.getPendingPercent()).isNull();
		assertThat(allocation.getChangeReason()).isNull();
	}

	@Test
	void clearingTheChangeKeepsTheOldValues() {
		Allocation allocation = approved();
		allocation.requestChange(80, START, END.plusDays(7), "Client extended the sprint");

		allocation.clearPendingChange();

		assertThat(allocation.getStatus()).isEqualTo(AllocationStatus.APPROVED);
		assertThat(allocation.getPercent()).isEqualTo(60);
		assertThat(allocation.getEndDate()).isEqualTo(END);
		assertThat(allocation.getPendingStartDate()).isNull();
	}

	@Test
	void onlyAnApprovedAllocationCanBeChanged() {
		Allocation proposed = new Allocation(null, null, 60, START, END, null);

		assertThatThrownBy(() -> proposed.requestChange(80, START, END, "reason"))
			.isInstanceOf(IllegalStateException.class);
		assertThat(proposed.getStatus()).isEqualTo(AllocationStatus.PROPOSED);
		assertThat(proposed.getPendingPercent()).isNull();
	}

	@Test
	void aSecondChangeCannotOverwriteThePendingOne() {
		Allocation allocation = approved();
		allocation.requestChange(80, START, END, "first");

		assertThatThrownBy(() -> allocation.requestChange(90, START, END, "second"))
			.isInstanceOf(IllegalStateException.class);
		assertThat(allocation.getPendingPercent()).isEqualTo(80);
	}

	@Test
	void thereIsNothingToApplyWithoutAPendingChange() {
		assertThatThrownBy(() -> approved().applyPendingChange()).isInstanceOf(IllegalStateException.class);
	}

	static Allocation approved() {
		Allocation allocation = new Allocation(null, null, 60, START, END, null);
		allocation.setStatus(AllocationStatus.APPROVED);
		return allocation;
	}

}
