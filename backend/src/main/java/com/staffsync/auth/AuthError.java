package com.staffsync.auth;

import java.time.Instant;

/**
 * Error body for 401/403 responses. A temporary stand-in that follows the shape of the
 * standard error format (§10) until {@code common/ErrorResponse} lands with US-02 (#9).
 */
public record AuthError(Instant timestamp, int status, String code, String message) {

	public static AuthError of(int status, String code, String message) {
		return new AuthError(Instant.now(), status, code, message);
	}

}
