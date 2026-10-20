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

**Development (hot reload)**

```bash
docker compose up -d db
```

Then start the backend with `backend/run-dev.cmd` (or from the IDE) and the frontend with `npm start` in `frontend/`. Stop the `frontend` container first, because both use port 4200.

**Reset the database**

```bash
docker compose down -v
```

## Dev accounts

The Flyway seed creates one account per role (there is no self-registration). They are for local development and demos only.

| Email | Role | Password |
|---|---|---|
| `admin@staffsync.local` | ADMIN | `Password123!` |
| `pm@staffsync.local` | PM | `Password123!` |
| `rm@staffsync.local` | RM | `Password123!` |
| `employee@staffsync.local` | EMPLOYEE (managed by the RM) | `Password123!` |
