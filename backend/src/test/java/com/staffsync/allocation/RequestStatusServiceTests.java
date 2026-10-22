package com.staffsync.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.staffsync.common.NotFoundException;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Seniority;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link RequestStatusService} (BR-10). The request has headcount 2. The count of active
 * allocations comes from the repository, so the BR-16 rule that {@code CHANGE_PENDING} counts is checked on
 * the statuses it is asked for, and end to end in AllocationControllerTests (T-36).
 */
@ExtendWith(MockitoExtension.class)
class RequestStatusServiceTests {

	static final Long REQUEST_ID = 10L;

	@Mock
	StaffingRequestRepository requestRepository;

	@Mock
	AllocationRepository allocationRepository;

	@InjectMocks
	RequestStatusService requestStatusService;

	StaffingRequest request;

	@BeforeEach
	void setUp() {
		// The project doesn't matter for the status, so it stays null
		request = new StaffingRequest(null, "Java Developer", Seniority.MEDIOR, 60, LocalDate.of(2026, 11, 1),
				LocalDate.of(2027, 1, 31), 2);
		ReflectionTestUtils.setField(request, "id", REQUEST_ID);
	}

	@Test
	void noActiveAllocationIsOpen() {
		request.setStatus(RequestStatus.PARTIALLY_FILLED);
		givenActive(0);

		assertThat(requestStatusService.recalculate(REQUEST_ID)).isEqualTo(RequestStatus.OPEN);
		assertThat(request.getStatus()).isEqualTo(RequestStatus.OPEN);
	}

	@Test
	void fewerActiveAllocationsThanTheHeadcountIsPartiallyFilledAndKeepsTheProposals() {
		givenActive(1);

		assertThat(requestStatusService.recalculate(REQUEST_ID)).isEqualTo(RequestStatus.PARTIALLY_FILLED);
		assertThat(request.getStatus()).isEqualTo(RequestStatus.PARTIALLY_FILLED);
		verify(allocationRepository, never()).findByRequestIdAndStatus(any(), any());
	}

	// ---- T-19

	@Test
	void asManyActiveAllocationsAsTheHeadcountIsFilledAndCancelsTheRemainingProposals() {
		givenActive(2);
		Allocation third = proposal();
		Allocation fourth = proposal();
		when(allocationRepository.findByRequestIdAndStatus(REQUEST_ID, AllocationStatus.PROPOSED))
			.thenReturn(List.of(third, fourth));

		assertThat(requestStatusService.recalculate(REQUEST_ID)).isEqualTo(RequestStatus.FILLED);
		assertThat(request.getStatus()).isEqualTo(RequestStatus.FILLED);
		assertThat(third.getStatus()).isEqualTo(AllocationStatus.CANCELLED);
		assertThat(fourth.getStatus()).isEqualTo(AllocationStatus.CANCELLED);
	}

	@Test
	void moreActiveAllocationsThanTheHeadcountIsStillFilled() {
		// The PM can lower the headcount after approvals
		givenActive(3);

		assertThat(requestStatusService.recalculate(REQUEST_ID)).isEqualTo(RequestStatus.FILLED);
	}

	// ---- T-36 / BR-16

	@Test
	void activeMeansApprovedAndChangePending() {
		givenActive(2);

		requestStatusService.recalculate(REQUEST_ID);

		verify(allocationRepository).countByRequestIdAndStatusIn(REQUEST_ID, AllocationStatus.ACTIVE);
		assertThat(AllocationStatus.ACTIVE).containsExactlyInAnyOrder(AllocationStatus.APPROVED,
				AllocationStatus.CHANGE_PENDING);
	}

	// ---- edge cases

	@Test
	void aCancelledRequestIsLeftAlone() {
		request.setStatus(RequestStatus.CANCELLED);
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));

		assertThat(requestStatusService.recalculate(REQUEST_ID)).isEqualTo(RequestStatus.CANCELLED);
		assertThat(request.getStatus()).isEqualTo(RequestStatus.CANCELLED);
		verify(allocationRepository, never()).countByRequestIdAndStatusIn(any(), any());
	}

	@Test
	void anUnknownRequestIsNotFound() {
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> requestStatusService.recalculate(REQUEST_ID)).isInstanceOf(NotFoundException.class);
	}

	private void givenActive(long count) {
		when(requestRepository.findById(REQUEST_ID)).thenReturn(Optional.of(request));
		when(allocationRepository.countByRequestIdAndStatusIn(REQUEST_ID, AllocationStatus.ACTIVE)).thenReturn(count);
	}

	private Allocation proposal() {
		return new Allocation(request, null, 60, request.getStartDate(), request.getEndDate(), null);
	}

}
