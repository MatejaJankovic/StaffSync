## What
<!-- One user story. What does this PR add or change? List its tasks, one commit each. -->

<!-- Close the story and every task, one line each: -->
Closes #<story>
Closes #<task>

## Business rules
<!-- Which rules does it implement or touch? e.g. BR-1, BR-5 -->
BR-

## How to test
<!-- For QA: steps in Swagger and/or the UI, which user to log in as, and which test cases (T-xx) apply -->
1. 

## Type
- [ ] Feature PR (user-visible)
- [ ] Technical PR (setup, configuration, refactoring)

Every PR needs one approval from any team member. QA tests on `main` after the merge.

## Definition of Done
- [ ] Input is validated (Bean Validation) and errors use the standard format
- [ ] New endpoints have Swagger annotations (`@Tag`, `@Operation`, `@ApiResponse`) and work from Swagger UI
- [ ] Schema changes are a new Flyway migration, with the version number reserved on the channel
- [ ] `mvn verify` passes locally (backend)
- [ ] `ng build` and `ng test` pass locally (frontend)
- [ ] Works with `docker compose up --build`
