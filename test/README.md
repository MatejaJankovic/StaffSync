# StaffSync QA tests

Playwright tests from the [test plan](../docs/TEST_PLAN.md). Each test name starts with its test case ID from [TEST_CASES.md](../docs/TEST_CASES.md).

```text
api/        API clients: one class per endpoint group
fixtures/   The seeded personas and their password, and the Playwright fixtures (`test.ts`)
tests/api/  API tests
```

## Run

1. Start the full stack from the repo root. The first run needs a freshly reset database. After that the tests can run again without a reset, because the allocation tests cancel their QA project at the end, and with it everything they booked:

   ```bash
   docker compose down -v && docker compose up --build
   ```

   Wait until http://localhost:8080/api/health answers.

2. In `test/`, install once, then run:

   ```bash
   npm install
   npm run test:api
   ```

3. Open the HTML report of the last run with `npm run report`.

Playwright runs the TypeScript without checking its types, so run `npm run typecheck` before you push.

The API URL defaults to `http://localhost:8080`. Set `API_URL` to test another backend.

The allocation tests use the fixed demo dates of the seed (November 2026 – January 2027), so they only work until 2026-10-31. From 2026-11-01 their approved allocations have started and can't be cancelled any more.
