package com.staffsync.common;

import java.util.Map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
@Tag(name = "Health", description = "Check that the backend and its database are up")
public class HealthController {

	private final JdbcTemplate jdbcTemplate;

	public HealthController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@Operation(summary = "Report whether the backend and the database are up (public, no token needed)")
	@ApiResponse(responseCode = "200", description = "Backend and database are up")
	@ApiResponse(responseCode = "503", description = "The database is down")
	@GetMapping
	public ResponseEntity<Map<String, String>> health() {
		boolean dbUp;
		try {
			dbUp = Integer.valueOf(1).equals(jdbcTemplate.queryForObject("SELECT 1", Integer.class));
		}
		catch (Exception ex) {
			dbUp = false;
		}
		Map<String, String> body = Map.of("status", dbUp ? "UP" : "DOWN", "database", dbUp ? "UP" : "DOWN");
		return ResponseEntity.status(dbUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(body);
	}

}
