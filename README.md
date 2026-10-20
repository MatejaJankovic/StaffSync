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

The backend runs with the `dev` Spring profile here, which provides a local JWT secret and the dev accounts below. Without that profile, `JWT_SECRET` is required (at least 32 characters) and the backend won't start without it.

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

The `dev` profile seeds one account per role from `db/dev-seed` (there is no self-registration). Other environments don't get them.

| Name | Email | Role | Password |
|---|---|---|---|
| Vukasin Patkovic | `vukasin_admin@staffsync.local` | ADMIN | `Password123!` |
| Mateja Jankovic | `mateja_pm@staffsync.local` | PM | `Password123!` |
| Lazar Dunjic | `lazar_rm@staffsync.local` | RM | `Password123!` |
| Bogdan Vujic | `bogdan_employee@staffsync.local` | EMPLOYEE (managed by the RM) | `Password123!` |
