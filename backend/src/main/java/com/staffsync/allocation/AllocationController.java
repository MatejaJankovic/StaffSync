package com.staffsync.allocation;

import java.time.LocalDate;

import com.staffsync.allocation.dto.AllocationDto;
import com.staffsync.allocation.dto.AllocationProposalDto;
import com.staffsync.allocation.dto.ProposeAllocationRequest;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/allocations")
@Tag(name = "Allocations", description = "Propose, approve, reject and change allocations")
@SecurityRequirement(name = "bearerAuth")
public class AllocationController {

	private final AllocationService allocationService;

	public AllocationController(AllocationService allocationService) {
		this.allocationService = allocationService;
	}

	@Operation(summary = "Search allocations, filtered by role",
			description = "An EMPLOYEE sees their own allocations, a PM those on their projects, an RM those of their "
					+ "team, an ADMIN all of them. The filters narrow that further: a filter outside what the caller "
					+ "may see gives an empty page. from/to keep the allocations whose period overlaps them. Paged, "
					+ "sorted by startDate by default. Sortable by id, percent, startDate, endDate, status and "
					+ "createdAt")
	@ApiResponse(responseCode = "200", description = "A page of allocations")
	@ApiResponse(responseCode = "400", description = "Unknown status, a malformed date, from after to, or an unknown "
			+ "sort property", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public Page<AllocationDto> search(@RequestParam(required = false) AllocationStatus status,
			@RequestParam(required = false) Long employeeId, @RequestParam(required = false) Long projectId,
			@Parameter(example = "2026-11-01") @RequestParam(required = false) @DateTimeFormat(
					iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@Parameter(example = "2027-01-31") @RequestParam(required = false) @DateTimeFormat(
					iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@ParameterObject @PageableDefault(sort = "startDate") Pageable pageable,
			@AuthenticationPrincipal AuthUser user) {
		return allocationService.search(status, employeeId, projectId, from, to, pageable, user);
	}

	@Operation(summary = "Propose an employee for a staffing request (PM who owns the project)",
			description = "The allocation starts as PROPOSED. Percent and period default to the request's. If active "
					+ "and proposed allocations plus this one would go over the employee's capacity, the proposal "
					+ "is still created and the response lists warnings (soft booking, BR-2)")
	@ApiResponse(responseCode = "201", description = "Proposed, with any capacity warnings")
	@ApiResponse(responseCode = "400",
			description = "A field is missing or out of range, the start date is after the end date, the period is "
					+ "outside the request (BR-3), the employee is not an active EMPLOYEE, or lacks a required "
					+ "skill at its minimum level (BR-9)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the request's project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No request or no employee with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "The request is not OPEN or PARTIALLY_FILLED (BR-9), the project is COMPLETED or "
					+ "CANCELLED, or the employee already has an overlapping allocation on this request (BR-8)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public AllocationProposalDto propose(@Valid @RequestBody ProposeAllocationRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return allocationService.propose(request, user);
	}

}
