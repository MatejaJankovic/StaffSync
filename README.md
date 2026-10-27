StaffSync replaces spreadsheets and chat messages in the process of assigning people to projects. A project manager creates a staffing request (skills, seniority level, allocation percentage, period), the system returns a ranked list of candidates with an explanation of each score, and a line manager approves or rejects the allocation with one click. A day-by-day capacity rule guarantees that nobody is booked beyond their capacity, and every change to an approved allocation also goes through approval.

Key features: 4 roles (Employee, PM, RM, Admin), a matching engine with a 0-100 score, capacity checks over time, an allocation change workflow, Swagger documentation, and the whole stack with a single command: docker compose up --build

## Running

**Whole stack (demo / pre-merge check)**

```bash
docker compose up --build
```

- App: http://localhost:4200 (nginx forwards `/api` to the backend)
- Backend: http://localhost:8080 (health: `/api/health`, Swagger: `/swagger-ui.html`)
- Postgres: `localhost:5432`

Optionally copy `.env.example` to `.env` to override `DB_USER`, `DB_PASSWORD` and `JWT_SECRET`.

The backend runs with the `dev` Spring profile here, which provides a local JWT secret and the demo data below. Without that profile, `JWT_SECRET` is required (at least 32 characters) and the backend won't start without it.

**Development (hot reload)**

```bash
docker compose up -d db
```

Then start the backend with `backend/run-dev.cmd` (or from the IDE with the `dev` profile active) and the frontend with `npm start` in `frontend/`. Stop the `frontend` container first, because both use port 4200.

**Reset the database**

```bash
docker compose down -v
```

## Dev accounts

The `dev` profile seeds a demo dataset from `db/dev-seed` (there is no self-registration). Other environments don't get it. **Every account has the password `Password123!`.**

The [§4 demo](docs/CLAUDE.md#4-glavni-scenario-demo-tok) personas:

| Name | Email | Role | Department | RM | Demo data |
|---|---|---|---|---|---|
| Ana Jovanovic | `ana_pm@staffsync.local` | PM | Engineering | | Creates *Project Alpha* live |
| Igor Stankovic | `igor_rm@staffsync.local` | RM | Backend | | Marko's and Jelena's RM |
| Marko Nikolic | `marko_employee@staffsync.local` | EMPLOYEE, SENIOR | Backend | Igor | Java 5, Spring 4, PostgreSQL 3, free from Nov 1 |
| Jelena Petrovic | `jelena_employee@staffsync.local` | EMPLOYEE, MEDIOR | Backend | Igor | Java 4, Spring 3, no PostgreSQL, 60% on *Helios CRM* until Nov 14 |

Admin and managers:

| Name | Email | Role | Department |
|---|---|---|---|
| Vukasin Patkovic | `vukasin_admin@staffsync.local` | ADMIN | |
| Mateja Jankovic | `mateja_pm@staffsync.local` | PM | Engineering |
| Dragan Simic | `dragan_pm@staffsync.local` | PM | Engineering |
| Lazar Dunjic | `lazar_rm@staffsync.local` | RM | Engineering |
| Maja Kovacevic | `maja_rm@staffsync.local` | RM | Frontend |

Employees (capacity 100% unless noted):

| Name | Email | Seniority | Department | RM |
|---|---|---|---|---|
| Nikola Djordjevic | `nikola_employee@staffsync.local` | SENIOR | Backend | Igor |
| Luka Popovic | `luka_employee@staffsync.local` | SENIOR | Backend | Igor |
| Aleksandar Ristic | `aleksandar_employee@staffsync.local` | MEDIOR | Backend | Igor |
| Nemanja Pavlovic | `nemanja_employee@staffsync.local` | JUNIOR | Backend | Igor |
| Vladimir Tomic | `vladimir_employee@staffsync.local` | SENIOR | Backend | Igor |
| Stefan Milosevic | `stefan_employee@staffsync.local` | MEDIOR, 50% | Backend | Lazar |
| Milica Lazic | `milica_employee@staffsync.local` | JUNIOR, 80% | Backend | Lazar |
| Ivana Markovic | `ivana_employee@staffsync.local` | MEDIOR | Backend | Lazar |
| Teodora Ilic | `teodora_employee@staffsync.local` | SENIOR | Frontend | Maja |
| Filip Kostic | `filip_employee@staffsync.local` | MEDIOR | Frontend | Maja |
| Sara Mitrovic | `sara_employee@staffsync.local` | JUNIOR | Frontend | Maja |
| Uros Zivkovic | `uros_employee@staffsync.local` | MEDIOR, 80% | Frontend | Maja |
| Katarina Stojanovic | `katarina_employee@staffsync.local` | SENIOR, 50% | Frontend | Maja |
| Mina Todorovic | `mina_employee@staffsync.local` | JUNIOR | Frontend | Maja |
| Dusan Obradovic | `dusan_employee@staffsync.local` | MEDIOR | Frontend | Lazar |
| Jovana Savic | `jovana_employee@staffsync.local` | SENIOR | QA & DevOps | Maja |
| Marija Bogdanovic | `marija_employee@staffsync.local` | MEDIOR | QA & DevOps | Maja |
| Ognjen Vasic | `ognjen_employee@staffsync.local` | JUNIOR, 50% | QA & DevOps | Maja |
| Milan Cvetkovic | `milan_employee@staffsync.local` | SENIOR | QA & DevOps | Lazar |
| Tamara Antic | `tamara_employee@staffsync.local` | MEDIOR, 80% | QA & DevOps | Lazar |
| Djordje Radovanovic | `djordje_employee@staffsync.local` | JUNIOR | QA & DevOps | Lazar |
| Bogdan Vujic | `bogdan_employee@staffsync.local` | MEDIOR | Engineering | Lazar |
| Lena Grujic | `lena_employee@staffsync.local` | MEDIOR | Engineering | Igor |
| Vuk Krstic | `vuk_employee@staffsync.local` | SENIOR, 80% | Engineering | Igor |
| Nina Arsic | `nina_employee@staffsync.local` | MEDIOR | Engineering | Igor |
| Petar Jovic | `petar_employee@staffsync.local` | SENIOR, 80% | Engineering | Lazar |
| Andjela Pesic | `andjela_employee@staffsync.local` | JUNIOR | Engineering | Lazar |
| Bojan Lukic | `bojan_employee@staffsync.local` | MEDIOR, 50% | Engineering | Maja |

## API conventions

Every developer documents their own endpoints. These rules are part of the [Definition of Done](docs/CLAUDE.md#15-definition-of-done).

### Swagger

Swagger UI is at http://localhost:8080/swagger-ui.html and the OpenAPI JSON at `/v3/api-docs`. Both are public.

**Trying a protected endpoint:** call `POST /api/auth/login` (e.g. with one of the dev accounts above), copy `token` from the response, click **Authorize** and paste the token without the `Bearer ` prefix. The token is kept across page reloads until you click *Logout* in the same dialog.

**Annotations on every controller** (reference examples: `AuthController` and `HealthController`):

- One `@Tag(name = …, description = …)` per controller.
- `@SecurityRequirement(name = "bearerAuth")` on the controller class. Only when a controller mixes public and protected endpoints (like `AuthController`) put it on each protected method instead.
- `@Operation(summary = …)` on every endpoint.
- `@ApiResponse` for the success code and for the errors that matter: 400, 403, 404 and 409.
- `@Schema(example = …)` on the fields of request DTOs, so *Try it out* is pre-filled with a valid body.

```java
@RestController
@RequestMapping("/api/allocations")
@Tag(name = "Allocations", description = "Propose, approve, reject and change allocations")
@SecurityRequirement(name = "bearerAuth")
public class AllocationController {

    @Operation(summary = "Approve a proposed allocation or a pending change")
    @ApiResponse(responseCode = "200", description = "Approved")
    @ApiResponse(responseCode = "403", description = "Not the employee's resource manager")
    @ApiResponse(responseCode = "409", description = "Capacity exceeded or invalid status")
    @PostMapping("/{id}/approve")
    public AllocationDto approve(@PathVariable Long id) { … }
}
```

For list endpoints, add `@ParameterObject Pageable pageable` so Swagger shows `page`, `size` and `sort` as separate fields.

### Errors

Every error has the same JSON shape, written by `common/GlobalExceptionHandler` (and by `SecurityConfig` for 401/403 before a controller is reached):

```json
{
  "timestamp": "2026-11-03T10:15:30Z",
  "status": 409,
  "code": "CAPACITY_EXCEEDED",
  "message": "Capacity exceeded on 3 days",
  "details": [{ "date": "2026-11-10", "load": 110 }]
}
```

| Situation | Status | `code` | `details` |
|---|---|---|---|
| Bean Validation failed (`@Valid` body, constrained parameter, `@Validated` service) | 400 | `VALIDATION_ERROR` | `[{ "field": "email", "message": "must not be blank" }]` |
| Malformed JSON, missing or wrongly typed parameter | 400 | `BAD_REQUEST` | `[]` |
| No token, or an invalid or expired one | 401 | `UNAUTHORIZED` | `[]` |
| Wrong role (`@PreAuthorize`) | 403 | `FORBIDDEN` | `[]` |
| `NotFoundException`, or an unknown URL | 404 | `NOT_FOUND` | `[]` |
| `BusinessException` | its own | its own, e.g. `CAPACITY_EXCEEDED` | whatever the service passes |
| Anything else | 500 | `INTERNAL_ERROR` | `[]`. The stack trace is only logged |

**In your code:** never build error bodies in controllers and don't add `@ExceptionHandler`s. Throw from the service instead:

```java
throw new NotFoundException("Project", id);                       // 404 "Project 42 not found"
throw new BusinessException(HttpStatus.CONFLICT, "CAPACITY_EXCEEDED",
        "Capacity exceeded on 3 days", List.of(Map.of("date", day, "load", 110)));
```

Use an UPPER_SNAKE_CASE `code` the UI can rely on, a `message` a user can read (the UI shows it in a snackbar), and document it with `@ApiResponse(responseCode = "409", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))`.

### Paging

Lists take `page` (0-based), `size` (default 20, max 100) and `sort` (`sort=lastName,asc`, repeat it for more fields), and return a Spring Data `Page`, which is always serialized as:

```json
{
  "content": [ … ],
  "page": { "size": 20, "number": 0, "totalElements": 45, "totalPages": 3 }
}
```

```java
@GetMapping
public Page<ProjectDto> list(@RequestParam(required = false) ProjectStatus status,
        @ParameterObject @PageableDefault(sort = "name") Pageable pageable) {
    return projectService.list(status, pageable);   // repository.findAll(spec, pageable).map(mapper::toDto)
}
```

The frontend's `paged-table` component reads exactly this shape.

## Shared UI components

Reuse these instead of building your own. Each file has a doc comment with a full example.

| What | Where | Use it for |
|---|---|---|
| Error snackbar | `core/error/error.interceptor.ts` | Nothing to do: every failed `/api` call shows the API's `message` in a snackbar (except 401, which logs the user out). If your page shows the error itself (e.g. inline in a form), pass `{ context: skipErrorSnackbar() }` to that request |
| `Notifications` | `core/error/notifications.ts` | `notifications.success('Allocation approved')` after an action, or `error(…)` for a client-side error |
| `ConfirmDialogService` | `shared/confirm-dialog/` | `confirm({ title, message, confirmText?, cancelText?, destructive? })` returns `Observable<boolean>`, `false` for cancel/Escape/outside click |
| `<app-status-chip>` | `shared/status-chip/` | `<app-status-chip [status]="row.status" />` for any project, request or allocation status, with one color per meaning |
| `<app-paged-table>` | `shared/paged-table/` | Any backend list: give it `columns` and a `fetch(query)` function. It sends `page`/`size`/`sort` and reads `{ content, page }`. Custom cells with `<ng-template appPagedTableCell="key" let-row>` |
| `Page<T>`, `PageQuery`, `toPageParams` | `core/api/page.ts` | Typing list responses and building the query in your service |

```ts
// project.service.ts
list(query: PageQuery, filters: { status?: ProjectStatus }): Observable<Page<ProjectDto>> {
  let params = toPageParams(query);
  if (filters.status) {
    params = params.set('status', filters.status);
  }
  return this.http.get<Page<ProjectDto>>('/api/projects', { params });
}
```
