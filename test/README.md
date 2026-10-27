# StaffSync QA tests

Playwright tests from the [test plan](../docs/TEST_PLAN.md). Each test name starts with its test case ID from [TEST_CASES.md](../docs/TEST_CASES.md).

```text
api/        API clients: one class per endpoint group
fixtures/   The seeded personas and their password
tests/api/  API tests
```

## Run

1. Start the full stack from the repo root, on a freshly reset database:

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

The API URL defaults to `http://localhost:8080`. Set `API_URL` to test another backend.
