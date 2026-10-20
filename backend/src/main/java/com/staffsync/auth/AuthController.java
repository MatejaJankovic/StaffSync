package com.staffsync.auth;

import com.staffsync.auth.dto.LoginRequest;
import com.staffsync.auth.dto.LoginResponse;
import com.staffsync.user.dto.UserDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Log in and get the current user")
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@Operation(summary = "Log in with email and password and get a JWT valid for 8 h")
	@ApiResponse(responseCode = "200", description = "Logged in")
	@ApiResponse(responseCode = "400", description = "Email or password missing or malformed",
			content = @Content)
	@ApiResponse(responseCode = "401", description = "Wrong email or password, or the user is inactive",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@PostMapping("/login")
	public LoginResponse login(@Valid @RequestBody LoginRequest request) {
		return authService.login(request);
	}

	@Operation(summary = "Get the currently logged-in user")
	@SecurityRequirement(name = "bearerAuth")
	@ApiResponse(responseCode = "200", description = "The current user")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@GetMapping("/me")
	public UserDto me(@AuthenticationPrincipal AuthUser user) {
		return authService.me(user);
	}

	// Stand-in until the GlobalExceptionHandler from US-02 (#9) takes this over
	@ExceptionHandler(InvalidCredentialsException.class)
	ResponseEntity<AuthError> handleInvalidCredentials(InvalidCredentialsException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
			.body(AuthError.of(HttpStatus.UNAUTHORIZED.value(), "UNAUTHORIZED", ex.getMessage()));
	}

}
