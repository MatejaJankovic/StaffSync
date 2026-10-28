# StaffSync frontend

The Angular app of StaffSync: standalone components, Angular CDK with the project's own UI kit (`src/app/shared/ui`, styled with the `--ss-*` tokens in `src/styles/`), Reactive Forms and RxJS. How to run the whole stack, the demo and the dev accounts are in the [root README](../README.md); the specification is [`docs/CLAUDE.md`](../docs/CLAUDE.md).

## Development server

Start the database and the backend first (see the root README), then:

```bash
npm start
```

Open http://localhost:4200. `proxy.conf.json` forwards `/api` to the backend on port 8080, and the app reloads when a source file changes. Stop the `frontend` Docker container first, because it uses port 4200 too.

## Checks before a pull request

There is no CI, so run these locally (see [CONTRIBUTING](../CONTRIBUTING.md#testing-and-validation)):

```bash
npm run build
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run format:check
```

`npm test` runs the unit tests with [Vitest](https://vitest.dev/). There are no end-to-end tests in this folder.

## Where things are

| Folder | What |
|---|---|
| `src/app/core` | Auth (login, guards, interceptor, *Change password*), the error toast, the shell with the role menu |
| `src/app/features` | One folder per page or area: projects, requests, matching (candidates), allocations (team panel, *Pending approvals*, *My allocations*), team, employees (search), users, departments, skills, profile, home |
| `src/app/shared` | Reusable components (`paged-table`, `status-chip`, `capacity-bar`, `change-diff`, `confirm-dialog`, ...) and the UI kit in `shared/ui` |
