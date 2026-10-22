package com.staffsync.request;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import com.staffsync.request.dto.StaffingRequestDto;
import com.staffsync.request.dto.StaffingRequestRequest;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Staffing requests",
		description = "Everyone can list a project's requests, the PM who owns the project manages them")
@SecurityRequirement(name = "bearerAuth")
public class StaffingRequestController {

	private final StaffingRequestService requestService;

	public StaffingRequestController(StaffingRequestService requestService) {
		this.requestService = requestService;
	}

	@Operation(summary = "List the staffing requests of a project",
			description = "Paged, sorted by creation time by default. Sortable by id, title, seniority, allocationPercent, "
					+ "startDate, endDate, headcount, status and createdAt")
	@ApiResponse(responseCode = "200", description = "A page of requests")
	@ApiResponse(responseCode = "400", description = "Unknown sort property",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No project with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/api/projects/{projectId}/requests")
	public Page<StaffingRequestDto> list(@PathVariable Long projectId,
			@ParameterObject @PageableDefault(sort = "createdAt") Pageable pageable) {
		return requestService.listForProject(projectId, pageable);
	}

	@Operation(summary = "Create a staffing request on a project (PM who owns it)",
			description = "The status starts as OPEN. The period must be inside the project period (BR-3)")
	@ApiResponse(responseCode = "201", description = "Created")
	@ApiResponse(responseCode = "400",
			description = "A field is missing or out of range, the start date is after the end date, the period is "
					+ "outside the project, or a skill is unknown or listed twice (BR-3)",
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
	@PostMapping("/api/projects/{projectId}/requests")
	@ResponseStatus(HttpStatus.CREATED)
	public StaffingRequestDto create(@PathVariable Long projectId, @Valid @RequestBody StaffingRequestRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return requestService.create(projectId, request, user);
	}

	@Operation(summary = "Get one staffing request (PM who owns the project)")
	@ApiResponse(responseCode = "200", description = "The request, with its skills")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No request with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@GetMapping("/api/requests/{id}")
	public StaffingRequestDto get(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return requestService.get(id, user);
	}

	@Operation(summary = "Edit a staffing request (PM who owns the project)",
			description = "Replaces the title, seniority, allocation, period, headcount and skills. The status is "
					+ "calculated from the allocations and is not changed here")
	@ApiResponse(responseCode = "200", description = "Updated")
	@ApiResponse(responseCode = "400",
			description = "A field is missing or out of range, the start date is after the end date, the period is "
					+ "outside the project, or a skill is unknown or listed twice (BR-3)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No request with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The request is CANCELLED, or the project is COMPLETED or CANCELLED",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PutMapping("/api/requests/{id}")
	public StaffingRequestDto update(@PathVariable Long id, @Valid @RequestBody StaffingRequestRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return requestService.update(id, request, user);
	}

	@Operation(summary = "Cancel a staffing request (PM who owns the project)",
			description = "The request is not deleted: its status becomes CANCELLED and it is returned")
	@ApiResponse(responseCode = "200", description = "Cancelled")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No request with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "Already CANCELLED, or FILLED (cancel an allocation first)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@DeleteMapping("/api/requests/{id}")
	public StaffingRequestDto cancel(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return requestService.cancel(id, user);
	}

}
