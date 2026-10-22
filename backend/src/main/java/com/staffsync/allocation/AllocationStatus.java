package com.staffsync.allocation;

import java.util.Set;

/**
 * §9: an allocation starts {@code PROPOSED}. The RM moves it to {@code APPROVED} or
 * {@code REJECTED}, and a requested change on an approved allocation puts it in
 * {@code CHANGE_PENDING} until the RM decides (BR-15).
 */
public enum AllocationStatus {

	PROPOSED, APPROVED, CHANGE_PENDING, REJECTED, CANCELLED;

	/** Counted in capacity (BR-1), request status (BR-10) and deactivation (BR-12), see BR-16. */
	public static final Set<AllocationStatus> ACTIVE = Set.of(APPROVED, CHANGE_PENDING);

	/** Active plus proposed, for soft-booking warnings (BR-2). */
	public static final Set<AllocationStatus> ACTIVE_OR_PROPOSED = Set.of(APPROVED, CHANGE_PENDING, PROPOSED);

	public boolean isActive() {
		return ACTIVE.contains(this);
	}

}
