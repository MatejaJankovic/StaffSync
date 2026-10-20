package com.staffsync.common;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.staffsync.common.ErrorResponse.FieldViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Turns every exception thrown while handling a request into an {@link ErrorResponse} (§10):
 * <ul>
 * <li>bean validation of a body, parameter or service call → 400 {@code VALIDATION_ERROR},
 * with {@code details: [{ field, message }]}</li>
 * <li>{@link BusinessException} (including {@link NotFoundException}) → its own status and code</li>
 * <li>{@code @PreAuthorize} denials → 403 {@code FORBIDDEN}</li>
 * <li>Spring MVC errors (malformed JSON, missing parameter, unknown URL, wrong method, ...) → their
 * status, with the status name as the code, e.g. 404 {@code NOT_FOUND}</li>
 * <li>anything else → 500 {@code INTERNAL_ERROR}, logged here and never sent with a stack trace</li>
 * </ul>
 * 401 and 403 raised before a controller is reached are written by {@code SecurityConfig}.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	public static final String VALIDATION_ERROR = "VALIDATION_ERROR";

	public static final String INTERNAL_ERROR = "INTERNAL_ERROR";

	private static final String VALIDATION_MESSAGE = "Some fields are invalid";

	private static final String INTERNAL_MESSAGE = "An unexpected error occurred";

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(BusinessException.class)
	ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex) {
		return respond(ErrorResponse.of(ex.getStatus(), ex.getCode(), ex.getMessage(), ex.getDetails()));
	}

	/** Validation of a {@code @Validated} service or component method. */
	@ExceptionHandler(ConstraintViolationException.class)
	ResponseEntity<ErrorResponse> handleConstraintViolation(ConstraintViolationException ex) {
		List<FieldViolation> details = ex.getConstraintViolations()
			.stream()
			.map(violation -> new FieldViolation(lastNode(violation.getPropertyPath()), violation.getMessage()))
			.sorted(Comparator.comparing(FieldViolation::field))
			.toList();
		return respond(validationError(details));
	}

	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
		return respond(ErrorResponse.of(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied"));
	}

	@ExceptionHandler(AuthenticationException.class)
	ResponseEntity<ErrorResponse> handleAuthentication(AuthenticationException ex) {
		return respond(ErrorResponse.of(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required"));
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
		log.error("Unexpected error", ex);
		return respond(ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_ERROR, INTERNAL_MESSAGE));
	}

	/** {@code @Valid @RequestBody}. */
	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<FieldViolation> details = ex.getBindingResult()
			.getAllErrors()
			.stream()
			.map(GlobalExceptionHandler::toViolation)
			.toList();
		return handleExceptionInternal(ex, validationError(details), headers, HttpStatus.BAD_REQUEST, request);
	}

	/** Constraints directly on controller parameters, e.g. {@code @RequestParam @Min(1) int size}. */
	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		if (!status.is4xxClientError()) {
			// A constraint on a return value failed: a server bug, not bad input
			return super.handleHandlerMethodValidationException(ex, headers, status, request);
		}
		List<FieldViolation> details = new ArrayList<>();
		for (ParameterValidationResult result : ex.getParameterValidationResults()) {
			if (result instanceof ParameterErrors errors) {
				errors.getAllErrors().forEach(error -> details.add(toViolation(error)));
			}
			else {
				String name = result.getMethodParameter().getParameterName();
				result.getResolvableErrors()
					.forEach(error -> details.add(new FieldViolation(name, error.getDefaultMessage())));
			}
		}
		return handleExceptionInternal(ex, validationError(details), headers, HttpStatus.BAD_REQUEST, request);
	}

	/** Every other Spring MVC exception ends up here: replace the default ProblemDetail body. */
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body, HttpHeaders headers,
			HttpStatusCode statusCode, WebRequest request) {
		if (!(body instanceof ErrorResponse)) {
			if (statusCode.is5xxServerError()) {
				log.error("Unexpected error", ex);
			}
			body = ErrorResponse.of(statusCode, codeFor(statusCode), messageFor(ex, body, statusCode));
		}
		return super.handleExceptionInternal(ex, body, headers, statusCode, request);
	}

	private static ResponseEntity<ErrorResponse> respond(ErrorResponse body) {
		return ResponseEntity.status(body.status()).body(body);
	}

	private static ErrorResponse validationError(List<FieldViolation> details) {
		return ErrorResponse.of(HttpStatus.BAD_REQUEST, VALIDATION_ERROR, VALIDATION_MESSAGE, details);
	}

	private static FieldViolation toViolation(ObjectError error) {
		String field = error instanceof FieldError fieldError ? fieldError.getField() : error.getObjectName();
		return new FieldViolation(field, error.getDefaultMessage());
	}

	/** {@code approve.request.percent} → {@code percent}. */
	private static String lastNode(Path path) {
		String name = null;
		for (Path.Node node : path) {
			name = node.getName();
		}
		return name;
	}

	private static String codeFor(HttpStatusCode status) {
		if (status.value() == HttpStatus.INTERNAL_SERVER_ERROR.value()) {
			return INTERNAL_ERROR;
		}
		HttpStatus known = HttpStatus.resolve(status.value());
		return known != null ? known.name() : "ERROR";
	}

	private static String messageFor(Exception ex, @Nullable Object body, HttpStatusCode status) {
		if (status.is5xxServerError()) {
			return INTERNAL_MESSAGE;
		}
		if (ex instanceof NoResourceFoundException) {
			return "Resource not found";
		}
		if (body instanceof ProblemDetail problem && problem.getDetail() != null) {
			return problem.getDetail();
		}
		HttpStatus known = HttpStatus.resolve(status.value());
		return known != null ? known.getReasonPhrase() : "Request failed";
	}

}
