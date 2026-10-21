package com.staffsync.skill;

import java.util.List;

import com.staffsync.auth.AuthError;
import com.staffsync.skill.dto.SkillDto;
import com.staffsync.skill.dto.SkillRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/skills")
@Tag(name = "Skills", description = "The skills catalog: everyone can read it, only an Admin can change it")
@SecurityRequirement(name = "bearerAuth")
public class SkillController {

	private final SkillService skillService;

	public SkillController(SkillService skillService) {
		this.skillService = skillService;
	}

	@Operation(summary = "List skills, optionally for one category",
			description = "Ordered by category (alphabetically by the category's code, e.g. BACKEND, DATABASE, DEVOPS), then by name")
	@ApiResponse(responseCode = "200", description = "The skills")
	@ApiResponse(responseCode = "400", description = "Unknown category", content = @Content)
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@GetMapping
	public List<SkillDto> list(@RequestParam(required = false) SkillCategory category) {
		return skillService.list(category);
	}

	@Operation(summary = "Get one skill")
	@ApiResponse(responseCode = "200", description = "The skill")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "404", description = "No skill with this id",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@GetMapping("/{id}")
	public SkillDto get(@PathVariable Long id) {
		return skillService.get(id);
	}

	@Operation(summary = "Add a skill to the catalog (Admin)")
	@ApiResponse(responseCode = "201", description = "Created")
	@ApiResponse(responseCode = "400",
			description = "Name is blank, too long or has control characters, or the category is missing or unknown",
			content = @Content)
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "409", description = "A skill with this name already exists",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public SkillDto create(@Valid @RequestBody SkillRequest request) {
		return skillService.create(request);
	}

	@Operation(summary = "Rename a skill or change its category (Admin)")
	@ApiResponse(responseCode = "200", description = "Updated")
	@ApiResponse(responseCode = "400",
			description = "Name is blank, too long or has control characters, or the category is missing or unknown",
			content = @Content)
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "404", description = "No skill with this id",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "409", description = "Another skill already has this name",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@PutMapping("/{id}")
	public SkillDto update(@PathVariable Long id, @Valid @RequestBody SkillRequest request) {
		return skillService.update(id, request);
	}

	@Operation(summary = "Delete a skill (Admin)")
	@ApiResponse(responseCode = "204", description = "Deleted")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "403", description = "Not an Admin",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "404", description = "No skill with this id",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@ApiResponse(responseCode = "409",
			description = "The skill is in use (rated by an employee or required by a request)",
			content = @Content(schema = @Schema(implementation = AuthError.class)))
	@PreAuthorize("hasRole('ADMIN')")
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable Long id) {
		skillService.delete(id);
	}

	// Stand-ins until the GlobalExceptionHandler from US-02 (#9) takes these over
	@ExceptionHandler(SkillNotFoundException.class)
	ResponseEntity<AuthError> handleNotFound(SkillNotFoundException ex) {
		return error(HttpStatus.NOT_FOUND, "SKILL_NOT_FOUND", ex);
	}

	@ExceptionHandler(DuplicateSkillException.class)
	ResponseEntity<AuthError> handleDuplicate(DuplicateSkillException ex) {
		return error(HttpStatus.CONFLICT, "SKILL_NAME_TAKEN", ex);
	}

	@ExceptionHandler(SkillInUseException.class)
	ResponseEntity<AuthError> handleInUse(SkillInUseException ex) {
		return error(HttpStatus.CONFLICT, "SKILL_IN_USE", ex);
	}

	private static ResponseEntity<AuthError> error(HttpStatus status, String code, RuntimeException ex) {
		return ResponseEntity.status(status).body(AuthError.of(status.value(), code, ex.getMessage()));
	}

}
