package com.staffsync.allocation;

import com.staffsync.common.NotFoundException;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * BR-10: a staffing request's status follows from its active allocations, so it is set in this one place.
 * Approve (US-10), cancel (US-12), change approval (US-13) and closing a project (US-24) call it after they
 * change an allocation.
 */
@Service
public class RequestStatusService {

	private final StaffingRequestRepository requestRepository;

	private final AllocationRepository allocationRepository;

	public RequestStatusService(StaffingRequestRepository requestRepository,
			AllocationRepository allocationRepository) {
		this.requestRepository = requestRepository;
		this.allocationRepository = allocationRepository;
	}

	/**
	 * Sets the request's status from the number of people with an active allocation on it, {@code APPROVED} or
	 * {@code CHANGE_PENDING} (BR-16): 0 is {@code OPEN}, 1 to headcount − 1 is {@code PARTIALLY_FILLED},
	 * headcount or more is {@code FILLED}. A {@code CANCELLED} request is left alone. Once the request is
	 * {@code FILLED}, its remaining {@code PROPOSED} allocations are cancelled (T-19). Returns the status.
	 */
	@Transactional
	public RequestStatus recalculate(Long requestId) {
		StaffingRequest request = requestRepository.findById(requestId)
			.orElseThrow(() -> new NotFoundException("Staffing request", requestId));
		if (request.getStatus() == RequestStatus.CANCELLED) {
			return RequestStatus.CANCELLED;
		}

		// The query flushes first, so an allocation changed in this transaction is counted with its new status
		long active = activePeople(requestId);
		RequestStatus status;
		if (active == 0) {
			status = RequestStatus.OPEN;
		}
		else if (active < request.getHeadcount()) {
			status = RequestStatus.PARTIALLY_FILLED;
		}
		else {
			status = RequestStatus.FILLED;
		}
		request.setStatus(status);

		if (status == RequestStatus.FILLED) {
			allocationRepository.findByRequestIdAndStatus(requestId, AllocationStatus.PROPOSED)
				.forEach(proposal -> proposal.setStatus(AllocationStatus.CANCELLED));
		}
		return status;
	}

	/**
	 * How many different employees have an active allocation on the request. Headcount counts people, so an
	 * employee with two allocations one after the other fills one place, not two.
	 */
	public long activePeople(Long requestId) {
		return allocationRepository.countEmployeesByRequest(requestId, AllocationStatus.ACTIVE);
	}

}
