package com.staffsync.common;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

	private final JdbcTemplate jdbcTemplate;

	public HealthController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

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
