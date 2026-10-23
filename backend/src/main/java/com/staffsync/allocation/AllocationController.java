package com.staffsync.allocation;

import java.time.LocalDate;

import com.staffsync.allocation.dto.AllocationChangeDto;
import com.staffsync.allocation.dto.AllocationDto;
import com.staffsync.allocation.dto.AllocationProposalDto;
import com.staffsync.allocation.dto.ChangeAllocationRequest;
import com.staffsync.allocation.dto.ProposeAllocationRequest;
import com.staffsync.allocation.dto.RejectAllocationRequest;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

	@Operation(summary = "Approve a proposed allocation or a pending change (the employee's RM)",
			description = "Runs the hard capacity check (BR-1): on every working day of the period, the employee's "
					+ "active allocations plus this one must stay within their capacity. Exactly 100% is allowed. "
					+ "For a pending change (CHANGE_PENDING) the check uses the new percent and period, without the "
					+ "allocation's current values, which they replace (BR-15). On success the allocation is APPROVED "
					+ "(with the new values, for a change) and decidedBy and decidedAt are set. On a 409 nothing "
					+ "changes: a proposal stays PROPOSED, and a change stays CHANGE_PENDING with the current values "
					+ "in force (T-30)")
	@ApiResponse(responseCode = "200", description = "Approved")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not the employee's resource manager (BR-5)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No allocation with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "Capacity exceeded (CAPACITY_EXCEEDED, with the overloaded days and loads in details, "
					+ "BR-1), the allocation is not PROPOSED or CHANGE_PENDING (BR-7), a proposal's request is not "
					+ "OPEN or PARTIALLY_FILLED, the project is COMPLETED or CANCELLED, the employee has been "
					+ "deactivated (EMPLOYEE_INACTIVE), or a change moves the start date of an allocation that has "
					+ "already started (ALLOCATION_ALREADY_STARTED, BR-15)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('RM')")
	@PostMapping("/{id}/approve")
	public AllocationDto approve(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return allocationService.approve(id, user);
	}

	@Operation(summary = "Reject a proposed allocation or a pending change (the employee's RM)",
			description = "A comment of at least 10 characters is required (BR-6). A proposal becomes REJECTED and "
					+ "can't be decided again. A pending change is dropped: the allocation goes back to APPROVED with "
					+ "its current values (BR-15). Either way decidedBy, decidedAt and decisionComment are set, and "
					+ "the request's status doesn't change")
	@ApiResponse(responseCode = "200", description = "Rejected")
	@ApiResponse(responseCode = "400", description = "The comment is missing, blank, or shorter than 10 characters (BR-6)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not the employee's resource manager (BR-5)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No allocation with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The allocation is not PROPOSED or CHANGE_PENDING (BR-7)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('RM')")
	@PostMapping("/{id}/reject")
	public AllocationDto reject(@PathVariable Long id, @Valid @RequestBody RejectAllocationRequest request,
			@AuthenticationPrincipal AuthUser user) {
		return allocationService.reject(id, request, user);
	}

	@Operation(summary = "Withdraw a proposal or cancel an allocation before it starts (PM who owns the project)",
			description = "A PROPOSED allocation is withdrawn. An APPROVED allocation can be cancelled only while its "
					+ "start date is after today: on its start date it has started. Either way it becomes CANCELLED "
					+ "and the request's status is recalculated (BR-10), e.g. a FILLED request goes back to "
					+ "PARTIALLY_FILLED. A pending change is withdrawn through the change request instead")
	@ApiResponse(responseCode = "200", description = "Cancelled")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No allocation with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "The project is completed or cancelled (PROJECT_CLOSED), the allocation is REJECTED, "
					+ "CANCELLED or CHANGE_PENDING (INVALID_ALLOCATION_STATUS), or it is APPROVED and has already "
					+ "started (ALLOCATION_ALREADY_STARTED)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PostMapping("/{id}/cancel")
	public AllocationDto cancel(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return allocationService.cancel(id, user);
	}

	@Operation(summary = "Request a change to an approved allocation (PM who owns the project)",
			description = "Asks the employee's RM to change the percent and/or the period (BR-15). A value left out "
					+ "keeps its current one, but at least one must change, and the reason is required. The "
					+ "allocation becomes CHANGE_PENDING with the new values in pending*, and the current values stay "
					+ "in force until the RM decides (BR-16). If active and proposed allocations plus the new values "
					+ "would go over the employee's capacity, the change is still requested and the response lists "
					+ "warnings (soft booking, BR-2). An allocation has started on its start date: from then on its "
					+ "start date can't change")
	@ApiResponse(responseCode = "200", description = "Change requested, with any capacity warnings")
	@ApiResponse(responseCode = "400",
			description = "The reason is missing or shorter than 10 characters, the percent is out of range or not a "
					+ "step of 10, nothing changes (NO_CHANGE), the start date changes on an allocation that has "
					+ "started (ALLOCATION_ALREADY_STARTED), or the new period is invalid or outside the request "
					+ "(BR-3)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No allocation with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "A change is already pending (CHANGE_ALREADY_PENDING), the allocation is not APPROVED "
					+ "(INVALID_ALLOCATION_STATUS), it has ended (ALLOCATION_ENDED), the project is completed or "
					+ "cancelled (PROJECT_CLOSED), or the new period overlaps another allocation of the employee on "
					+ "the same request (ALLOCATION_OVERLAP, BR-8)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@PostMapping("/{id}/change-request")
	public AllocationChangeDto requestChange(@PathVariable Long id,
			@Valid @RequestBody ChangeAllocationRequest request, @AuthenticationPrincipal AuthUser user) {
		return allocationService.requestChange(id, request, user);
	}

	@Operation(summary = "Withdraw a pending change (PM who owns the project)",
			description = "The allocation goes back to APPROVED with its current values, and the pending* fields and "
					+ "changeReason are cleared (BR-15)")
	@ApiResponse(responseCode = "200", description = "Change withdrawn")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No allocation with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "No change is pending (NO_PENDING_CHANGE)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@DeleteMapping("/{id}/change-request")
	public AllocationDto withdrawChange(@PathVariable Long id, @AuthenticationPrincipal AuthUser user) {
		return allocationService.withdrawChange(id, user);
	}

}
