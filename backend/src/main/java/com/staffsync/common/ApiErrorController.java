package com.staffsync.common;

import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Writes the {@link ErrorResponse} for errors that never reach {@link GlobalExceptionHandler},
 * because they happen outside Spring MVC: an exception thrown by a security filter (for example
 * the database being down while the JWT filter looks up the user) or a status set with
 * {@code sendError}. The servlet container forwards those to {@code /error}, which would otherwise
 * be answered by Spring Boot's default body.
 */
@Hidden
@RestController
public class ApiErrorController implements ErrorController {

	private static final Logger log = LoggerFactory.getLogger(ApiErrorController.class);

	@RequestMapping("/error")
	public ResponseEntity<ErrorResponse> error(HttpServletRequest request) {
		HttpStatusCode status = statusOf(request);
		ErrorResponse body;
		if (status.is5xxServerError()) {
			Object cause = request.getAttribute(RequestDispatcher.ERROR_EXCEPTION);
			log.error("Unexpected error outside the controllers on {}", request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI),
					cause instanceof Throwable throwable ? throwable : null);
			body = ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR, GlobalExceptionHandler.INTERNAL_ERROR,
					GlobalExceptionHandler.INTERNAL_MESSAGE);
		}
		else {
			HttpStatus known = HttpStatus.resolve(status.value());
			body = ErrorResponse.of(status, GlobalExceptionHandler.codeFor(status),
					known != null ? known.getReasonPhrase() : "Request failed");
		}
		return ResponseEntity.status(body.status()).contentType(MediaType.APPLICATION_JSON).body(body);
	}

	private static HttpStatusCode statusOf(HttpServletRequest request) {
		Object code = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
		if (code instanceof Integer value && value >= 400 && value < 600) {
			return HttpStatusCode.valueOf(value);
		}
		return HttpStatus.INTERNAL_SERVER_ERROR;
	}

}
