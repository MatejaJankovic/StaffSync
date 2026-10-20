package com.staffsync.common;

import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.HttpStatusCode;

/**
 * The one error body the API returns (§10), built by {@link GlobalExceptionHandler} and the
 * security layer. {@code details} is never null: it holds field errors for validation, or
 * whatever a {@link BusinessException} passes, e.g. {@code [{ "date": "2026-11-10", "load": 110 }]}.
 */
@Schema(description = "Standard error body")
public record ErrorResponse(@Schema(example = "2026-11-03T10:15:30Z") Instant timestamp,
		@Schema(example = "409") int status,
		@Schema(example = "CAPACITY_EXCEEDED") String code,
		@Schema(example = "Capacity exceeded on 3 days") String message,
		@Schema(description = "Extra data about the error, e.g. field errors or the overbooked days") List<?> details) {

	public ErrorResponse {
		details = details == null ? List.of() : details;
	}

	public static ErrorResponse of(HttpStatusCode status, String code, String message) {
		return of(status, code, message, List.of());
	}

	public static ErrorResponse of(HttpStatusCode status, String code, String message, List<?> details) {
		return new ErrorResponse(Instant.now(), status.value(), code, message, details);
	}

	/** An entry of {@code details} for a 400 {@code VALIDATION_ERROR}. */
	@Schema(description = "A field that failed validation")
	public record FieldViolation(@Schema(example = "email") String field,
			@Schema(example = "must be a well-formed email address") String message) {

	}

}
