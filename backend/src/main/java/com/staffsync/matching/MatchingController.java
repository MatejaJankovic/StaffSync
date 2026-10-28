package com.staffsync.matching;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import com.staffsync.matching.dto.CandidateDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Matching", description = "Ranks the employees who could fill a staffing request, with a score and "
		+ "the reasons for it")
@SecurityRequirement(name = "bearerAuth")
public class MatchingController {

	private final MatchingService matchingService;

	public MatchingController(MatchingService matchingService) {
		this.matchingService = matchingService;
	}

	@Operation(summary = "Rank the candidates for a staffing request (PM who owns the project)",
			description = """
					Returns the employees who are active, have every required skill at its minimum level, and \
					are not yet proposed or staffed on this request, best first. Only an OPEN or PARTIALLY_FILLED \
					request has candidates (BR-9): for a FILLED or CANCELLED one the answer is 409, because it \
					takes no proposal.

					**Score, 0 to 100:** skills (50) + availability (40) + seniority (10).
					- *Skills:* each requested skill matches 0.7 at its minimum level and 0.1 more per level above \
					it, up to 1.0. A nice-to-have skill the candidate lacks matches 0. The average match × 50.
					- *Availability:* the share of working days (Mon–Fri) of the request period on which the free \
					capacity covers the requested percent × 40.
					- *Seniority:* the same level 10, a neighbouring level 5, anything else 0.

					**Rounding:** each component is rounded to a whole number and the score is the sum of the \
					rounded components, so `breakdown` always adds up to `score` (23 + 34 + 10 = 67, from 23.33 + \
					33.85 + 10). Equal scores are ordered by the unrounded score, then by employee id.

					`reasons` list the requested skills the candidate has, and `warnings` the days without enough \
					free capacity, the requested skills they lack and a different seniority.

					The list is always sorted by score, so a `sort` parameter has no effect.""")
	@ApiResponse(responseCode = "200", description = "A page of candidates, highest score first")
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "403", description = "Not a PM, or not the PM who owns the request's project (BR-4)",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "No request with this id",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "The request is FILLED or CANCELLED, so it takes no proposal "
			+ "(BR-9)", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@PreAuthorize("hasRole('PM')")
	@GetMapping("/api/requests/{id}/candidates")
	public Page<CandidateDto> candidates(@PathVariable Long id,
			@ParameterObject @PageableDefault(size = 20) Pageable pageable,
			@AuthenticationPrincipal AuthUser user) {
		return matchingService.getCandidates(id, user, pageable);
	}

}
