package com.staffsync.auth;

import java.time.Instant;

/**
 * The temporary error body from US-01, replaced by {@link com.staffsync.common.ErrorResponse}.
 * Kept only so branches started before US-02 still compile; remove it once nothing uses it.
 * @deprecated throw a {@link com.staffsync.common.BusinessException} instead and let the
 * {@code GlobalExceptionHandler} write the {@code ErrorResponse}
 */
@Deprecated(forRemoval = true)
public record AuthError(Instant timestamp, int status, String code, String message) {

	public static AuthError of(int status, String code, String message) {
		return new AuthError(Instant.now(), status, code, message);
	}

}
