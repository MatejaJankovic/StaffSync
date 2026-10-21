package com.staffsync.request;

/**
 * §9: a request starts {@code OPEN} and can be {@code CANCELLED} from {@code OPEN} or
 * {@code PARTIALLY_FILLED}. {@code PARTIALLY_FILLED} and {@code FILLED} are calculated from the
 * active allocations (BR-10), so nothing in this package sets them.
 */
public enum RequestStatus {

	OPEN, PARTIALLY_FILLED, FILLED, CANCELLED

}
