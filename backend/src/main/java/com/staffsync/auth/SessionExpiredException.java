package com.staffsync.auth;

import com.staffsync.common.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Thrown when a valid token's user no longer exists or was deactivated. Kept apart from
 * {@link InvalidCredentialsException} because no password was entered.
 */
public class SessionExpiredException extends BusinessException {

	public static final String MESSAGE = "Your session is no longer valid";

	public SessionExpiredException() {
		super(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", MESSAGE);
	}

}
