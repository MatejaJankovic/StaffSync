package com.staffsync.employee;

import java.time.LocalDate;

import com.staffsync.common.ErrorResponse;
import com.staffsync.employee.dto.EmployeeSearchResultDto;
import com.staffsync.user.Seniority;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/employees")
@Tag(name = "Employees", description = "Search employees by skill, seniority, department and free capacity")
@SecurityRequirement(name = "bearerAuth")
public class EmployeeSearchController {

	private static final String LEVEL_RANGE = "Minimum level must be between 1 and 5";

	private static final String FREE_RANGE = "Minimum free % must be between 0 and 100";

	private final EmployeeSearchService employeeSearchService;

	public EmployeeSearchController(EmployeeSearchService employeeSearchService) {
		this.employeeSearchService = employeeSearchService;
	}

	@Operation(summary = "Search employees by skill, seniority, department and free capacity (PM, RM)",
			description = "Active employees only. Every filter is optional, and they combine with AND. With skillId, "
					+ "only employees who have the skill at minLevel or higher (1 by default). availableFrom, "
					+ "availableTo and minFreePercent go together: an employee matches when their free capacity "
					+ "(capacityPercent − APPROVED and CHANGE_PENDING allocations) is at least minFreePercent on "
					+ "every working day of the period, which is at most a year. Each result has the searched "
					+ "skill's level, the three best skills, and today's load and free capacity (on a weekend, the "
					+ "next Monday's). Paged, sorted by last name by default. Sortable by id, firstName, lastName, "
					+ "seniority, department, level and free")
	// Without useReturnTypeSchema, examples alone leave the page's schema out of the docs
	@ApiResponse(responseCode = "200", description = "A page of employees, possibly empty", useReturnTypeSchema = true,
			content = @Content(examples = @ExampleObject(value = """
					{
					  "content": [{
					    "id": 4, "firstName": "Bogdan", "lastName": "Vujic", "seniority": "MEDIOR",
					    "department": { "id": 1, "name": "Engineering" }, "skillLevel": 4,
					    "topSkills": [
					      { "skillId": 3, "name": "Java", "level": 4 },
					      { "skillId": 5, "name": "Spring", "level": 3 },
					      { "skillId": 8, "name": "PostgreSQL", "level": 2 }
					    ],
					    "capacityPercent": 100, "load": 60, "free": 40
					  }],
					  "page": { "size": 20, "number": 0, "totalElements": 1, "totalPages": 1 }
					}""")))
	@ApiResponse(responseCode = "400",
			description = "A filter is not a number, date or seniority (BAD_REQUEST). minLevel is not 1–5, "
					+ "minFreePercent is not 0–100, or minLevel is given without skillId (VALIDATION_ERROR). Only "
					+ "some of availableFrom, availableTo and minFreePercent are given (INVALID_AVAILABILITY_FILTER). "
					+ "availableFrom is after availableTo or the period is longer than a year (INVALID_PERIOD). "
					+ "Unknown sort property (INVALID_SORT)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM or an RM",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No skill or department with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasAnyRole('PM', 'RM')")
	@GetMapping("/search")
	public Page<EmployeeSearchResultDto> search(
			@Parameter(description = "Only employees who have this skill", example = "3")
			@RequestParam(required = false) Long skillId,
			@Parameter(description = "The skill's minimum level, 1–5. Needs skillId", example = "3")
			@RequestParam(required = false) @Min(value = 1, message = LEVEL_RANGE) @Max(value = 5,
					message = LEVEL_RANGE) Integer minLevel,
			@Parameter(example = "MEDIOR") @RequestParam(required = false) Seniority seniority,
			@Parameter(example = "1") @RequestParam(required = false) Long departmentId,
			@Parameter(description = "Start of the period that needs free capacity", example = "2026-11-02")
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate availableFrom,
			@Parameter(description = "End of the period that needs free capacity", example = "2026-11-30")
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate availableTo,
			@Parameter(description = "Free capacity % needed on every working day of the period, 0–100",
					example = "50")
			@RequestParam(required = false) @Min(value = 0, message = FREE_RANGE) @Max(value = 100,
					message = FREE_RANGE) Integer minFreePercent,
			@ParameterObject @PageableDefault(sort = "lastName") Pageable pageable) {
		return employeeSearchService.search(new EmployeeSearchFilters(skillId, minLevel, seniority, departmentId,
				availableFrom, availableTo, minFreePercent), pageable);
	}

}
