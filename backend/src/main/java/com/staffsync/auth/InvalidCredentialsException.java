package com.staffsync.auth;

/**
 * Thrown for any failed login: unknown email, wrong password or inactive user. They all
 * share one generic message, so the response never reveals whether the email exists.
 */
public class InvalidCredentialsException extends RuntimeException {

	public static final String MESSAGE = "Invalid email or password";

	public InvalidCredentialsException() {
		super(MESSAGE);
	}

}
