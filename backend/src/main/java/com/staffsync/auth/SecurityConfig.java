package com.staffsync.auth;

import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.staffsync.common.ErrorResponse;
import com.staffsync.user.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless JWT security. Role checks go on controller methods, e.g.
 * {@code @PreAuthorize("hasRole('PM')")} or {@code @PreAuthorize("hasAnyRole('ADMIN', 'RM')")}.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

	private static final String[] PUBLIC_PATHS = {
			"/api/health",
			"/swagger-ui.html",
			"/swagger-ui/**",
			"/v3/api-docs/**",
			// Spring's error page, so a 400 on a public endpoint isn't turned into a 401
			"/error",
	};

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, JwtService jwtService, UserRepository userRepository,
			ObjectMapper objectMapper) throws Exception {
		return http
				.csrf(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint((request, response, e) -> writeError(response, objectMapper,
								HttpStatus.UNAUTHORIZED, "Authentication required"))
						.accessDeniedHandler((request, response, e) -> writeError(response, objectMapper,
								HttpStatus.FORBIDDEN, "Access denied")))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(PUBLIC_PATHS).permitAll()
						.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
						// Checked before the request body is validated, so a non-Admin sending a bad body
						// gets 403 and not 400. The @PreAuthorize on the controller stays as a second layer.
						.requestMatchers(HttpMethod.POST, "/api/skills/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.PUT, "/api/skills/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.DELETE, "/api/skills/**").hasRole("ADMIN")
						// Same for departments
						.requestMatchers(HttpMethod.POST, "/api/departments/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.PUT, "/api/departments/**").hasRole("ADMIN")
						.requestMatchers(HttpMethod.DELETE, "/api/departments/**").hasRole("ADMIN")
						// Same for projects: a non-PM sending a bad body gets 403, not 400
						.requestMatchers(HttpMethod.POST, "/api/projects/**").hasRole("PM")
						.requestMatchers(HttpMethod.PUT, "/api/projects/**").hasRole("PM")
						.requestMatchers(HttpMethod.PATCH, "/api/projects/*/status").hasRole("PM")
						// And for staffing requests (POST is covered by /api/projects/{id}/requests above)
						.requestMatchers(HttpMethod.PUT, "/api/requests/**").hasRole("PM")
						.requestMatchers(HttpMethod.DELETE, "/api/requests/**").hasRole("PM")
						// And for user accounts. A single * on purpose: PUT /api/users/{id}/skills is for the owner too
						.requestMatchers(HttpMethod.GET, "/api/users").hasAnyRole("ADMIN", "RM")
						.requestMatchers(HttpMethod.POST, "/api/users").hasRole("ADMIN")
						.requestMatchers(HttpMethod.PUT, "/api/users/*").hasRole("ADMIN")
						.requestMatchers(HttpMethod.PATCH, "/api/users/*/deactivate").hasRole("ADMIN")
						.anyRequest().authenticated())
				.addFilterBefore(new JwtAuthenticationFilter(jwtService, userRepository), UsernamePasswordAuthenticationFilter.class)
				.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	private static void writeError(HttpServletResponse response, ObjectMapper objectMapper, HttpStatus status,
			String message) throws IOException {
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		objectMapper.writeValue(response.getOutputStream(), ErrorResponse.of(status, status.name(), message));
	}

}
