StaffSync replaces spreadsheets and chat messages in the process of assigning people to projects. A project manager creates a staffing request (skills, seniority level, allocation percentage, period), the system returns a ranked list of candidates with an explanation of each score, and a line manager approves or rejects the allocation, seeing beforehand whether it fits the person's capacity. A day-by-day capacity rule guarantees that nobody is booked beyond their capacity, and every change to an approved allocation also goes through approval.

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

This deletes the database volume. On the next start Flyway runs every migration again, seed included, so you're back to the demo data below. Reset before every rehearsal and before the demo, because the demo changes the data. Do the same when your local database is out of sync with the migrations.

## Demo

The [§4 scenario](docs/CLAUDE.md#4-glavni-scenario-demo-tok), step by step. It takes about 5 minutes.

**Before you start:** reset and start the stack with one command, and wait for the backend log line `Started StaffsyncBackendApplication` (Flyway applies V1–V12 just before it):

```bash
docker compose down -v && docker compose up --build
```

Open http://localhost:4200. Use *Logout* in the user menu (the button with your name at the bottom of the sidebar) to switch roles. The password is always `Password123!`. *Approve* in *Pending approvals* asks for a confirmation, so click *Approve* in the dialog too.

**The demo is dated.** The seed is set up for the Sprint Review on 30 Oct 2026. Nobody can be staffed in the past (BR-17), so from 2 Nov 2026 on the seeded proposals can't be approved any more and the §4 numbers change; move the seed dates with a new seed migration before demoing later.

| # | Log in as | Do | You should see |
|---|---|---|---|
| 1 | Ana, `ana_pm@staffsync.local` | *My projects* → *New project*: **Project Alpha**, any client, 1 Nov 2026 – 31 Mar 2027 (dates as DD/MM/YYYY) → *Save* | *Project created*, and Project Alpha in the list as *Planned* |
| 2 | Ana | Open Project Alpha → *New request*: **Java Developer**, Medior, 60%, headcount 2, period 1 Nov 2026 – 31 Jan 2027. *Add skill* three times: Java ≥ 4 required, Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have → *Save* | The request in the project, *Open* |
| 3 | Ana | *Find candidates* on the request | **Marko 85** (40 + 40 + 5, *Seniority SENIOR (MEDIOR requested)*), **Jelena 67** (23 + 34 + 10, *Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)*, *Missing PostgreSQL*), then Nikola 61, Luka 60, Stefan 47, Milica 41. The other 24 employees don't have the required skills |
| 4 | Ana | *Propose* on Marko, keep 60% and the whole period | Marko is *Proposed* |
| 5 | Igor, `igor_rm@staffsync.local` | *Pending approvals* → Marko on Java Developer, marked **New**, *Fits* in the *Capacity* column → *Approve* | Approved. In Ana's project the request is now *Partially filled*, *1 of 2* in the *Filled* column |
| 6 | Ana, then Igor | Ana: *Find candidates* → *Propose* Jelena for the whole period (the dialog warns about capacity). Igor: *Pending approvals* shows Jelena *Over capacity on 10 working days* → *Approve*, then confirm | A red panel above the list: *Not approved: Jelena Petrovic would be over capacity on 10 working days* with *2 Nov 2026 – 13 Nov 2026: 60% existing + 60% new = 120%*. Jelena stays in the list, *Proposed*. (The API answers 409 with *Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)*, which you see in Swagger) |
| 7 | Ana, then Igor | Ana: Project Alpha → *Team* → *Withdraw* Jelena, then *Find candidates* → *Propose* Jelena with the period **15 Nov 2026 – 31 Jan 2027** (the capacity warning disappears from the dialog). Igor: *Approve* | Approved. The request is now *Filled*, *2 of 2* |
| 8 | Ana, then Igor | Ana: Project Alpha → *Team* → *Request change* on Marko: **80%**, with a reason. Igor: *Pending approvals* shows Marko marked **Change**, *60% → 80%* → *Approve*, then *Approve change* in the dialog | Marko's allocation is *Approved* at 80% |

**If step 1 or 2 fails live:** Ana's project **Orion Customer Portal** already has the same *Java Developer* request. Open it and continue from step 3. This only works on a freshly reset database.

**What the seed provides for the other screens:** Lazar and Maja each have two items in *Pending approvals* (Maja's include a **Change** on Uros), *My team* shows partial loads and people on the bench, and Jelena's *My allocations* shows her 60% on *Helios CRM*. A rejection shows the RM's comment in the project's *Team*.

**Swagger:** http://localhost:8080/swagger-ui.html. Log in with `POST /api/auth/login`, copy the `token`, click *Authorize* and paste it (see [Swagger](#swagger) below).

## Dev accounts

The `dev` profile seeds a demo dataset from `db/dev-seed` (there is no self-registration). Other environments don't get it. **Every account has the password `Password123!`.**

An Admin creates further accounts on *Users* with a temporary password, which the person has to replace with their own at the first login; *Reset password* does the same for someone who forgot theirs. *Users* also activates a deactivated account again and hands a PM's open projects over to another PM, which is needed before that PM can be deactivated or given another role.

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

Lists take `page` (0-based), `size` (default 20, set with `@PageableDefault(size = 20)` since Spring's own default is 10; max 100) and `sort` (`sort=lastName,asc`, repeat it for more fields), and return a Spring Data `Page`, which is always serialized as:

```json
{
  "content": [ … ],
  "page": { "size": 20, "number": 0, "totalElements": 45, "totalPages": 3 }
}
```

```java
@GetMapping
public Page<ProjectDto> list(@RequestParam(required = false) ProjectStatus status,
        @ParameterObject @PageableDefault(size = 20, sort = "name") Pageable pageable) {
    return projectService.list(status, pageable);   // repository.findAll(spec, pageable).map(mapper::toDto)
}
```

The frontend's `paged-table` component reads exactly this shape.

## Shared UI components

Reuse these instead of building your own. Each file has a doc comment with a full example.

| What | Where | Use it for |
|---|---|---|
| Error toast | `core/error/error.interceptor.ts` | Nothing to do: every failed `/api` call shows the API's `message` in a toast, with its ISO dates and seniority levels written the way the UI writes them (`readableMessage` in `shared/dates.ts`), except 401, which logs the user out. If your page shows the error itself (e.g. inline in a form), pass `{ context: skipErrorSnackbar() }` to that request |
| `Notifications` | `core/error/notifications.ts` | `notifications.success('Allocation approved')` after an action, or `error(…)` for a client-side error |
| `ConfirmDialogService` | `shared/confirm-dialog/` | `confirm({ title, message, confirmText?, cancelText?, destructive? })` returns `Observable<boolean>`, `false` for cancel/Escape/outside click |
| `<app-status-chip>` | `shared/status-chip/` | `<app-status-chip [status]="row.status" />` for any project, request or allocation status, with one color per meaning |
| `<app-warning-list>` | `shared/warning-list/` | Warnings from the API, e.g. a candidate's, shown readably with a warning icon |
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
