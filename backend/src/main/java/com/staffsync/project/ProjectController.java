package com.staffsync.project;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import com.staffsync.project.dto.ProjectDto;
import com.staffsync.project.dto.ProjectRequest;
import com.staffsync.project.dto.ProjectStatusRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
@Tag(name = "Projects",
		description = "Everyone can read projects, a PM creates, edits and changes the status of their own")
@SecurityRequirement(name = "bearerAuth")
public class ProjectController {

	private final ProjectService projectService;

	public ProjectController(ProjectService projectService) {
		this.projectService = projectService;
	}

	@Operation(summary = "List projects, optionally by status and project manager",
			description = "Paged, sorted by name by default. Sortable by id, name, client, startDate, endDate and status")
	@ApiResponse(responseCode = "200", description = "A page of projects")
	@ApiResponse(responseCode = "400", description = "Unknown status or sort property",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public Page<ProjectDto> list(@RequestParam(required = false) ProjectStatus status,
			@RequestParam(required = false) Long pmId,
			@ParameterObject @PageableDefault(size = 20, sort = "name") Pageable pageable) {
		return projectService.list(status, pmId, pageable);
	}

	@Operation(summary = "Get one project")
	@ApiResponse(responseCode = "200", description = "The project")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No project with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{id}")
	public ProjectDto get(@PathVariable Long id) {
		return projectService.get(id);
	}

	@Operation(summary = "Create a project owned by the current PM (PM)",
			description = "The current user becomes the project manager, and the status starts as PLANNED")
	@ApiResponse(responseCode = "201", description = "Created")
	@ApiResponse(responseCode = "400",
			description = "A required field is missing or too long, or the start date is after the end date",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ProjectDto create(@Valid @RequestBody ProjectRequest request, @AuthenticationPrincipal AuthUser user) {
		return projectService.create(request, user);
	}

	@Operation(summary = "Edit a project (PM who owns it)",
			description = "Changes name, client, description and dates. The status is changed separately")
	@ApiResponse(responseCode = "200", description = "Updated")
	@ApiResponse(responseCode = "400",
			description = "A required field is missing or too long, or the start date is after the end date",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns this project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No project with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The project is COMPLETED or CANCELLED",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PutMapping("/{id}")
	public ProjectDto update(@PathVariable Long id, @Valid @RequestBody ProjectRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return projectService.update(id, request, user);
	}

	@Operation(summary = "Change a project's status (PM who owns it)",
			description = "PLANNED → ACTIVE → COMPLETED, or PLANNED / ACTIVE → CANCELLED. Completing or cancelling "
					+ "runs the BR-11 clean-up with today as the closing day: OPEN and PARTIALLY_FILLED requests and "
					+ "PROPOSED allocations are cancelled, pending changes are voided, approved allocations that "
					+ "haven't started are cancelled and the others end today")
	@ApiResponse(responseCode = "200", description = "The project with its new status")
	@ApiResponse(responseCode = "400", description = "The status is missing or unknown",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns this project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No project with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The move isn't allowed from the current status (§9)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PatchMapping("/{id}/status")
	public ProjectDto changeStatus(@PathVariable Long id, @Valid @RequestBody ProjectStatusRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return projectService.changeStatus(id, request.status(), user);
	}

}
