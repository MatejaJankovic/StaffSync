package com.staffsync.auth;

import com.staffsync.common.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Thrown for any failed login: unknown email, wrong password or inactive user. They all
 * share one generic message, so the response never reveals whether the email exists.
 */
public class InvalidCredentialsException extends BusinessException {

	public static final String MESSAGE = "Invalid email or password";

	public InvalidCredentialsException() {
		super(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", MESSAGE);
	}

}
