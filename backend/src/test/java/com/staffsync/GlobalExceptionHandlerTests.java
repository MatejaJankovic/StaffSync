package com.staffsync;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;

import java.util.List;
import java.util.Map;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Import({ TestcontainersConfiguration.class, GlobalExceptionHandlerTests.ErrorController.class,
		GlobalExceptionHandlerTests.ValidatedService.class })
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GlobalExceptionHandlerTests {

	private static final String BASE = "/api/test/errors";

	@LocalServerPort
	int port;

	String token;

	@BeforeEach
	void setUp() {
		RestAssured.port = port;
		token = given().contentType(ContentType.JSON)
			.body(Map.of("email", "bogdan_employee@staffsync.local", "password", "Password123!"))
			.when().post("/api/auth/login")
			.then().statusCode(200)
			.extract().path("token");
	}

	@Test
	void invalidBodyIs400WithFieldDetails() {
		assertError(given().auth().oauth2(token).contentType(ContentType.JSON)
			.body(Map.of("name", "", "percent", 150))
			.when().post(BASE + "/body")
			.then(), 400, "VALIDATION_ERROR")
			.body("details.field", containsInAnyOrder("name", "percent"))
			.body("details.message", not(empty()));
	}

	@Test
	void invalidRequestParamIs400WithFieldDetails() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/param?size=0")
			.then(), 400, "VALIDATION_ERROR")
			.body("details.field", contains("size"));
	}

	@Test
	void constraintViolationInAServiceIs400WithFieldDetails() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/service?value=0")
			.then(), 400, "VALIDATION_ERROR")
			.body("details.field", contains("value"));
	}

	@Test
	void constraintViolationOnAReturnValueIs500NotABadRequest() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/service-return?value=0")
			.then(), 500, "INTERNAL_ERROR")
			.body("message", equalTo("An unexpected error occurred"))
			.body("details", empty());
	}

	@Test
	void malformedJsonIs400() {
		assertError(given().auth().oauth2(token).contentType(ContentType.JSON)
			.body("{ not json")
			.when().post(BASE + "/body")
			.then(), 400, "BAD_REQUEST");
	}

	@Test
	void notFoundExceptionIs404() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/not-found")
			.then(), 404, "NOT_FOUND")
			.body("message", equalTo("Project 42 not found"));
	}

	@Test
	void unknownUrlIs404() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/does-not-exist")
			.then(), 404, "NOT_FOUND");
	}

	@Test
	void wrongMethodIs405() {
		assertError(given().auth().oauth2(token)
			.when().delete(BASE + "/not-found")
			.then(), 405, "METHOD_NOT_ALLOWED");
	}

	@Test
	void businessExceptionKeepsItsStatusCodeAndDetails() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/capacity")
			.then(), 409, "CAPACITY_EXCEEDED")
			.body("message", equalTo("Capacity exceeded on 1 day"))
			.body("details", hasSize(1))
			.body("details[0].date", equalTo("2026-11-10"))
			.body("details[0].load", equalTo(110));
	}

	@Test
	void unexpectedExceptionIs500WithoutInternals() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/boom")
			.then(), 500, "INTERNAL_ERROR")
			.body("message", equalTo("An unexpected error occurred"))
			.body("trace", equalTo(null))
			.body(not(org.hamcrest.Matchers.containsString("secret internal detail")));
	}

	@Test
	void missingTokenIs401() {
		assertError(given()
			.when().get(BASE + "/not-found")
			.then(), 401, "UNAUTHORIZED");
	}

	@Test
	void wrongRoleIs403() {
		assertError(given().auth().oauth2(token)
			.when().get(BASE + "/pm-only")
			.then(), 403, "FORBIDDEN");
	}

	@Test
	void failedLoginUsesTheStandardFormat() {
		assertError(given().contentType(ContentType.JSON)
			.body(Map.of("email", "nobody@staffsync.local", "password", "wrong"))
			.when().post("/api/auth/login")
			.then(), 401, "UNAUTHORIZED")
			.body("message", equalTo("Invalid email or password"));
	}

	@Test
	void pagesUseTheStableDtoShapeAndBindPageSizeAndSort() {
		given().auth().oauth2(token)
			.when().get(BASE + "/page?page=1&size=10&sort=name,desc")
			.then()
			.statusCode(200)
			.body("content", contains("name: DESC"))
			.body("page.size", equalTo(10))
			.body("page.number", equalTo(1))
			.body("page.totalElements", equalTo(45))
			.body("page.totalPages", equalTo(5))
			.body("pageable", equalTo(null));
	}

	private static ValidatableResponse assertError(ValidatableResponse response, int status, String code) {
		return response.statusCode(status)
			.contentType(ContentType.JSON)
			.body("timestamp", notNullValue())
			.body("status", equalTo(status))
			.body("code", equalTo(code))
			.body("message", notNullValue())
			.body("details", notNullValue());
	}

	record SampleBody(@NotBlank String name, @Min(1) @Max(100) int percent) {
	}

	/** Throws every kind of error the handler has to turn into the standard format. */
	@RestController
	@RequestMapping(BASE)
	static class ErrorController {

		private final ValidatedService service;

		ErrorController(ValidatedService service) {
			this.service = service;
		}

		@PostMapping("/body")
		SampleBody body(@Valid @RequestBody SampleBody body) {
			return body;
		}

		@GetMapping("/param")
		int param(@RequestParam @Min(1) int size) {
			return size;
		}

		@GetMapping("/service")
		int service(@RequestParam int value) {
			return service.check(value);
		}

		@GetMapping("/service-return")
		int serviceReturn(@RequestParam int value) {
			return service.checkResult(value);
		}

		@GetMapping("/not-found")
		void notFound() {
			throw new NotFoundException("Project", 42);
		}

		@GetMapping("/capacity")
		void capacity() {
			throw new BusinessException(HttpStatus.CONFLICT, "CAPACITY_EXCEEDED", "Capacity exceeded on 1 day",
					List.of(Map.of("date", "2026-11-10", "load", 110)));
		}

		@GetMapping("/boom")
		void boom() {
			throw new IllegalStateException("secret internal detail");
		}

		@PreAuthorize("hasRole('PM')")
		@GetMapping("/pm-only")
		String pmOnly() {
			return "ok";
		}

		@GetMapping("/page")
		Page<String> page(Pageable pageable) {
			return new PageImpl<>(List.of(pageable.getSort().toString()), pageable, 45);
		}

	}

	@Service
	@Validated
	static class ValidatedService {

		int check(@Min(1) int value) {
			return value;
		}

		/** The argument is fine, the result breaks its own constraint: a bug in the service. */
		@Min(1)
		int checkResult(int value) {
			return value;
		}

	}

}
