package com.staffsync.auth;

/**
 * Thrown when a valid token's user no longer exists or was deactivated. Kept apart from
 * {@link InvalidCredentialsException} because no password was entered.
 */
public class SessionExpiredException extends RuntimeException {

	public static final String MESSAGE = "Your session is no longer valid";

	public SessionExpiredException() {
		super(MESSAGE);
	}

}
