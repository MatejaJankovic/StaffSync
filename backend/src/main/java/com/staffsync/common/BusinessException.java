package com.staffsync.common;

import java.util.List;

import org.springframework.http.HttpStatus;

/**
 * Thrown by services when a business rule is broken. {@link GlobalExceptionHandler} turns it
 * into an {@link ErrorResponse} with this status, code, message and details, e.g.
 *
 * <pre>{@code
 * throw new BusinessException(HttpStatus.CONFLICT, "CAPACITY_EXCEEDED", "Capacity exceeded on 3 days",
 *         List.of(Map.of("date", "2026-11-10", "load", 110)));
 * }</pre>
 *
 * Use an UPPER_SNAKE_CASE code that the UI can rely on, and a message a user can read.
 */
public class BusinessException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	private final List<?> details;

	public BusinessException(HttpStatus status, String code, String message) {
		this(status, code, message, List.of());
	}

	public BusinessException(HttpStatus status, String code, String message, List<?> details) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details == null ? List.of() : List.copyOf(details);
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}

	public List<?> getDetails() {
		return details;
	}

}
