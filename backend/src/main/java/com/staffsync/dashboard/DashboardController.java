package com.staffsync.dashboard;

import java.util.List;

import com.staffsync.auth.AuthUser;
import com.staffsync.common.ErrorResponse;
import com.staffsync.dashboard.dto.DashboardCardDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@Tag(name = "Dashboard", description = "The number cards on the Home page, for the caller's role")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {

	private final DashboardService dashboardService;

	public DashboardController(DashboardService dashboardService) {
		this.dashboardService = dashboardService;
	}

	@Operation(summary = "The Home page cards for the caller's role (T-40)",
			description = "Each role gets only its own cards. EMPLOYEE: current load, active projects, next "
					+ "allocation. PM: active projects, open requests and proposals or changes waiting for an RM, on "
					+ "the PM's projects. RM: decisions waiting for me, team members on the bench this week (0% on "
					+ "every working day) and the team's average load today. ADMIN: active users, active projects and "
					+ "skills in the catalog. On a weekend, loads are those of the next Monday")
	@ApiResponse(responseCode = "200", description = "The cards, in display order",
			content = @Content(array = @ArraySchema(schema = @Schema(implementation = DashboardCardDto.class)),
					examples = {
							@ExampleObject(name = "EMPLOYEE", value = """
									[
									  { "key": "currentLoad", "label": "Current load", "value": "60%", "date": null, "link": "/my-allocations" },
									  { "key": "activeProjects", "label": "Active projects", "value": "1", "date": null, "link": "/my-allocations" },
									  { "key": "nextAllocation", "label": "Next allocation", "value": "Project Alpha", "date": "2026-11-01", "link": "/my-allocations" }
									]"""),
							@ExampleObject(name = "PM", value = """
									[
									  { "key": "activeProjects", "label": "Active projects", "value": "2", "date": null, "link": "/projects" },
									  { "key": "openRequests", "label": "Open requests", "value": "3", "date": null, "link": "/projects" },
									  { "key": "awaitingRm", "label": "Waiting for an RM", "value": "1", "date": null, "link": "/projects" }
									]"""),
							@ExampleObject(name = "RM", value = """
									[
									  { "key": "pendingDecisions", "label": "Decisions waiting for me", "value": "2", "date": null, "link": "/approvals" },
									  { "key": "benchThisWeek", "label": "On the bench this week", "value": "1", "date": null, "link": "/team" },
									  { "key": "averageLoad", "label": "Average team load", "value": "55%", "date": null, "link": "/team" }
									]"""),
							@ExampleObject(name = "ADMIN", value = """
									[
									  { "key": "activeUsers", "label": "Active users", "value": "37", "date": null, "link": "/admin/users" },
									  { "key": "activeProjects", "label": "Active projects", "value": "5", "date": null, "link": null },
									  { "key": "skills", "label": "Skills in the catalog", "value": "25", "date": null, "link": "/admin/skills" }
									]""") }))
	@ApiResponse(responseCode = "401", description = "Missing, invalid or expired token",
			content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public List<DashboardCardDto> cards(@AuthenticationPrincipal AuthUser user) {
		return dashboardService.cards(user);
	}

}
