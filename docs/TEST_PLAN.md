# StaffSync: Test plan

> **Sprint 1** · QA: Vukašin ([@patkovicvukasin](https://github.com/patkovicvukasin))
> **Test cases:** [docs/TEST_CASES.md](TEST_CASES.md) · **Spec:** [docs/CLAUDE.md](CLAUDE.md) · **Backlog:** [docs/SPRINT_BACKLOG.md](SPRINT_BACKLOG.md)

## Contents

1. [Purpose](#1-purpose)
2. [Scope](#2-scope)
3. [Test approach](#3-test-approach)
4. [Test environment and data](#4-test-environment-and-data)
5. [Entry and exit criteria](#5-entry-and-exit-criteria)
6. [Deliverables](#6-deliverables)
7. [Risks](#7-risks)

## 1. Purpose

This plan says what QA tests in StaffSync, how it's tested, and what is deliberately left out.

The sprint is short, so the plan is **risk-based**. The main goal is to cover the most important parts well: the demo's main flow (§4 of the spec) and the rules that would hurt most if they broke (login, capacity, approvals). Developers already cover the services and controllers with unit and integration tests. QA tests the application from the outside, the way a user or an API client sees it.

### Goals, by priority

1. **At least 10 API tests** (Playwright), starting with login, then the main flow and its business rules
2. **1 E2E test** of the §4 demo flow
3. **UI tests** (Playwright) for what happens on screen: login, navigation, and the main-flow screens
4. **1 JMeter performance test** with about 10,000 users

## 2. Scope

### Features and priority

Every MVP feature is listed. **Priority** decides the order of testing and how deeply each feature is tested.

| Feature | Story | Priority | Tested by QA with |
|---|---|---|---|
| Login, logout, role-based menu and guards | US-01 | High | API, UI |
| Error format, Swagger | US-02 | Medium | API (as part of other tests), exploratory |
| Projects and staffing requests | US-04, US-05 | High | UI, E2E |
| Matching engine (ranked candidates) | US-09, US-11 | High | API, UI, E2E |
| Propose an allocation | US-08 | High | API, UI, E2E |
| Approve or reject with the capacity check | US-10 | High | API, UI, E2E |
| Withdraw or cancel | US-12 | Medium | E2E |
| Change an approved allocation | US-13 | High | API, E2E |
| Pending approvals (New / Change) | US-14 | High | UI, E2E |
| Demo seed and full stack in Docker | US-15 | High | E2E (runs on it) |
| Change password | US-19 | Medium | API |
| Home cards, My team, My allocations, availability | US-16, US-20 – US-22 | Low | Exploratory |
| Admin: users, departments, skills catalog | US-03, US-17, US-18 | Low | Exploratory |
| Employee search | US-23 | Low | Exploratory |
| Project status and BR-11 clean-up | US-24 | Low | Exploratory |
| Performance of the main endpoints | – | Low | JMeter (one test) |

### Out of scope

| Item | Why |
|---|---|
| Unit and controller tests | Developers own them, and they already exist in `backend/src/test` and the frontend `*.spec.ts` files |
| Stretch work: absences, documents, heatmap (US-25 – US-27), so also T-07 and T-28 | Not in this sprint |
| Full authorization matrix (every role × every endpoint) | Low value for the effort. The most important checks (wrong role, wrong RM, no token) are covered by API test cases instead |
| Browsers other than Chromium, mobile layouts, accessibility | Internal desktop tool |
| Security beyond the basics | Only account enumeration, SQL injection on login and token checks are tested. No penetration testing |

## 3. Test approach

### Test levels

| Level | Tool | What it checks | Owner |
|---|---|---|---|
| Unit | JUnit 5, Mockito, Jasmine | Services and components in isolation | Developers |
| Integration / controller | Spring Boot Test, Testcontainers, REST Assured | Controllers against a real PostgreSQL | Developers |
| **API** | **Playwright** (`request`), plus a few **REST Assured** tests | Endpoints from the outside: status codes, error format, business rules | QA |
| **UI** | **Playwright** | What happens on screen when the user acts: forms, validation messages, navigation, dialogs | QA |
| **E2E** | **Playwright** | The §4 demo scenario across roles, in one run | QA |
| Performance | JMeter | Response times and errors under load | QA |
| Exploratory | Browser, Swagger UI | Low-priority features and anything the automated tests don't reach | QA |

### Project structure

The QA tests live in their own Playwright project in `test/` at the repo root. It sits next to `backend/`, `frontend/` and `docs/`, and the test types are folders inside `test/tests/`:

```text
test/
├── api/                 API clients (AuthApi, AllocationsApi, ...): one class per endpoint group
├── pages/               Page objects (LoginPage, CandidatesPage, ...): one class per screen
├── fixtures/            Test data and logged-in users per role
├── tests/
│   ├── api/             login.spec.ts, allocations.spec.ts, ...
│   ├── ui/              login.spec.ts, navigation.spec.ts, ...
│   └── e2e/             demo-flow.spec.ts
├── performance/         JMeter plan (.jmx)
└── playwright.config.ts
```

- **Page Object Model.** Spec files never use selectors or URLs directly. UI tests call page objects (`loginPage.signIn(email, password)`), and API tests call API clients (`authApi.login(email, password)`). When the UI or an endpoint changes, only one class changes.
- **REST Assured** is used for a small set of API tests (login and one allocation rule), in its own package `backend/src/test/java/com/staffsync/qa/`, to practise it next to Playwright. Those tests run with `mvn verify` like the rest of the backend tests.

### Test independence

The API, UI and E2E suites all change the data of the same seeded employees, and capacity is counted per employee across all projects. So:

- **One worker.** The suites that change data run with `workers: 1` in `playwright.config.ts`, because spec files running in parallel would book Marko and Jelena at the same time.
- **Chains run in order.** Cases that build on each other (TC_API_FLOW_003 → 004 → 011, 014 → 015 → 022, 006 → 023) are one `test.describe.serial` block. The first test of each chain creates its preconditions through the API clients, so the chain doesn't depend on another spec file.
- **One suite per reset.** The API, UI and E2E suites each start from their own reset database (§4). For example, after the E2E run Marko is approved at 60% for Nov 1 – Jan 31, so TC_API_FLOW_004 would get 409.

### How the test cases are written

- Each test case has an ID, priority, type (positive, negative, boundary or security), level and a link to its story or business rule (BR-x). See [TEST_CASES.md](TEST_CASES.md).
- The *Automated* column shows the spec file that automates the case. Cases marked *Manual* are run by hand during exploratory testing.
- Results are not kept in the test case file. They go into the test report at the end (`docs/TEST_REPORT.md`).

## 4. Test environment and data

| Environment | How to start | Used for |
|---|---|---|
| Full stack | `docker compose down -v && docker compose up --build` | UI, E2E, API and performance tests, and the demo |
| Development | `docker compose up -d db`, backend from `backend/run-dev.cmd`, frontend with `npm start` | Debugging a failing test |

- App: http://localhost:4200 · API: http://localhost:8080 · Swagger: http://localhost:8080/swagger-ui.html
- Browser: Chromium (installed by Playwright).
- **Test data:** the `dev` profile seed. Every account has the password `Password123!`. The main personas:

| Persona | Email | Role | Used for |
|---|---|---|---|
| Ana | `ana_pm@staffsync.local` | PM | Creates the project and request, proposes, requests changes |
| Igor | `igor_rm@staffsync.local` | RM | Approves Marko and Jelena |
| Marko | `marko_employee@staffsync.local` | EMPLOYEE, SENIOR | Best candidate (85), fully available |
| Jelena | `jelena_employee@staffsync.local` | EMPLOYEE, MEDIOR | Second candidate (67), 60% busy until Nov 14 |
| Lazar | `lazar_rm@staffsync.local` | RM | "Another team's RM" in negative tests |
| Vukasin | `vukasin_admin@staffsync.local` | ADMIN | Admin actions, deactivating a user |
| Stefan | `stefan_employee@staffsync.local` | EMPLOYEE, part-time 50% | Part-time over capacity. His PROPOSED 50% doesn't count (BR-2) |
| Milica | `milica_employee@staffsync.local` | EMPLOYEE, part-time 80% | Part-time at exactly her capacity. APPROVED 50% Dec 1 – Jan 29 |

The personas come from the demo seed (US-15, `backend/src/main/resources/db/dev-seed/V8`–`V10`). Stefan and Milica are in Lazar's team, so Lazar approves them.

- **Boundary data**, taken from §7 and §16 of the spec. Each item has an API test case in [TEST_CASES.md §2](TEST_CASES.md#2-api-main-flow-and-allocation-rules):
  - exactly 100% load (40% + 60%) and 110% load: Jelena on Nov 2 – 13
  - an overlap only on the boundary day, adjacent periods, and an overlap only on a weekend: Jelena's Helios allocation ends on Sat Nov 14
  - part-time employees at 50% and 80%: Stefan and Milica
- The first capacity example in §7 skips absence days. Absences are stretch work, so without them the overloaded days in that example are Nov 10 – 13 and Nov 16 – 20.
- **Clean data for every run:** the API suite, the UI suite and the E2E test each start from a freshly reset database (`docker compose down -v && docker compose up --build`). A unique project name isn't enough, because load is counted per employee across all projects: a second run would find Marko and Jelena already booked. Boundary cases that approve an allocation only to check the status code cancel it at the end, so they don't affect the next case.

## 5. Entry and exit criteria

### Entry: testing starts when

- the feature is merged into `main`
- the full stack starts with `docker compose up --build`, and login works
- for E2E: the demo seed (US-15) is merged

QA tests merged code on `main`, as §13 of the spec says. QA approval isn't required on pull requests. When a developer asks QA to look at a pull request before it merges, QA does it as soon as possible, but the pull request doesn't wait for QA.

### Bugs

A bug found on `main` is reported straight to the story owner on the team channel, so it can be fixed right away. If it isn't fixed the same day, it becomes a GitHub issue from the *Bug* template, linked to the story and assigned to its owner.

### Exit: QA signs off for the demo when

- every **High** priority test case has been run, and the automated ones pass
- the E2E demo flow passes in one run on a freshly reset database
- no known bug breaks the demo flow or a business rule
- the test report lists what was tested, the results, known bugs and limitations

## 6. Deliverables

| Deliverable | Location |
|---|---|
| Test plan and test cases | `docs/TEST_PLAN.md`, `docs/TEST_CASES.md` |
| Playwright API, UI and E2E tests | `test/tests/api`, `test/tests/ui`, `test/tests/e2e` |
| REST Assured tests | `backend/src/test/java/com/staffsync/qa/` |
| JMeter performance test | `test/performance/` |
| Test report | `docs/TEST_REPORT.md` |

## 7. Risks

| Risk | Mitigation |
|---|---|
| The demo seed changes | The tests read the persona data from one fixture file, so changes stay in one place |
| Tests that change data fail on the second run, because capacity is counted per employee across projects | The API suite, the UI suite and the E2E test each start from a reset database and run with one worker (§3, *Test independence*). Boundary cases cancel the allocations they approve |
| The seed and the test cases use fixed dates (Nov 2026 – Jan 2027), but the backend compares with today: an approved allocation can only be cancelled before its start date. From Nov 1, 2026 the cancel clean-up gets 409 `ALLOCATION_ALREADY_STARTED`, and a re-run fails | Run the suites before Nov 1, 2026. After that, reset the database between the cases that approve allocations instead of cancelling them, or move the seed dates forward |
| UI selectors break when the UI changes | Use roles and labels (`getByRole`, `getByLabel`) instead of CSS classes, all inside page objects |
