package com.staffsync.auth;

import com.staffsync.common.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Thrown when the current password given to change it is wrong (T-38). A 400 and not a 401,
 * because the user is logged in and a 401 would end their session in the UI.
 */
public class WrongPasswordException extends BusinessException {

	public static final String CODE = "WRONG_PASSWORD";

	public static final String MESSAGE = "Current password is incorrect";

	public WrongPasswordException() {
		super(HttpStatus.BAD_REQUEST, CODE, MESSAGE);
	}

}
