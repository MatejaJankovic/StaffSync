package com.staffsync.employeeskill;

import java.util.List;

import com.staffsync.common.ErrorResponse;
import com.staffsync.employeeskill.dto.EmployeeSkillDto;
import com.staffsync.employeeskill.dto.EmployeeSkillRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/{id}/skills")
@Tag(name = "Employee skills",
		description = "The skills an employee has rated: everyone can read them, only the employee or an Admin can change them")
@SecurityRequirement(name = "bearerAuth")
public class EmployeeSkillController {

	private final EmployeeSkillService employeeSkillService;

	public EmployeeSkillController(EmployeeSkillService employeeSkillService) {
		this.employeeSkillService = employeeSkillService;
	}

	@Operation(summary = "List a user's skills with level and years of experience",
			description = "Ordered by category (by the category's code), then by skill name")
	@ApiResponse(responseCode = "200", description = "The user's skills")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No user with this id (NOT_FOUND)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public List<EmployeeSkillDto> list(@PathVariable Long id) {
		return employeeSkillService.list(id);
	}

	@Operation(summary = "Replace a user's whole skill list (the user themself or an Admin)",
			description = "Skills left out of the list are removed. An empty list removes them all")
	@io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(
			array = @ArraySchema(schema = @Schema(implementation = EmployeeSkillRequest.class)),
			examples = @ExampleObject(value = """
					[
					  { "skillId": 1, "level": 4, "yearsOfExperience": 3 },
					  { "skillId": 2, "level": 3, "yearsOfExperience": 2 }
					]""")))
	@ApiResponse(responseCode = "200", description = "The user's new skill list")
	@ApiResponse(responseCode = "400",
			description = "Level not 1–5 or years not 0–60 (VALIDATION_ERROR), a skill listed twice (DUPLICATE_SKILL) or a skill not in the catalog (UNKNOWN_SKILL)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Neither this user nor an Admin (FORBIDDEN)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No user with this id (NOT_FOUND)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The list was saved at the same time by someone else (SKILLS_CHANGED), "
			+ "or it removes or lowers a skill below the level that a mandatory skill of one of the employee's current "
			+ "or future allocations or proposals requires (SKILL_REQUIRED_BY_ALLOCATION, BR-18)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('ADMIN') or #id == principal.id()")
	@PutMapping
	public List<EmployeeSkillDto> replace(@PathVariable Long id,
			@RequestBody List<@NotNull(message = "Skill entry is required") @Valid EmployeeSkillRequest> skills) {
		return employeeSkillService.replace(id, skills);
	}

}
