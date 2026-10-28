# StaffSync QA tests

Playwright tests from the [test plan](../docs/TEST_PLAN.md). Each test name starts with its test case ID from [TEST_CASES.md](../docs/TEST_CASES.md).

```text
api/        API clients: one class per endpoint group
pages/      Page objects: one class per screen
fixtures/   The seeded personas, the URLs, and the Playwright fixtures (test.ts for API tests, ui.ts for UI tests)
tests/api/  API tests
tests/ui/   UI tests
tests/e2e/  The §4 demo flow across roles
```

## Run

1. Start the full stack from the repo root, on a freshly reset database:

   ```bash
   docker compose down -v && docker compose up --build
   ```

   Wait until http://localhost:8080/api/health answers.

2. In `test/`, install once:

   ```bash
   npm install
   npx playwright install chromium
   ```

3. Run the tests:

   | Command | Runs | Database |
   |---|---|---|
   | `npm test` | API and UI tests | Reset before the first run. They clean up after themselves, so they can run again |
   | `npm run test:api` | API tests | The same |
   | `npm run test:ui` | UI tests | The same. They book no capacity, but they expect Jelena's seeded load, which an E2E run changes |
   | `npm run test:e2e` | The §4 demo flow | Reset before every run. It leaves Marko and Jelena booked, as the demo does |

   So one reset is enough for `npm test` followed by `npm run test:e2e`. Reset again before the next E2E run, or before `npm test` or `npm run test:ui` after an E2E run.

4. Open the HTML report of the last run with `npm run report`.

Playwright runs the TypeScript without checking its types, so run `npm run typecheck` before you push.

The URLs default to `http://localhost:8080` (API) and `http://localhost:4200` (app). Set `API_URL` or `APP_URL` to test another stack.

The allocation tests use the fixed demo dates of the seed (November 2026 – January 2027), so they only work until 2026-10-31. From 2026-11-01 their approved allocations have started and can't be cancelled any more.
