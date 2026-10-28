# StaffSync: Test report

> **Sprint 1** · QA: Vukašin ([@patkovicvukasin](https://github.com/patkovicvukasin))
> **Test plan:** [docs/TEST_PLAN.md](TEST_PLAN.md) · **Test cases:** [docs/TEST_CASES.md](TEST_CASES.md) · **Tests:** [test/](../test/README.md)

## Contents

1. [Summary](#1-summary)
2. [What was tested](#2-what-was-tested)
3. [Results](#3-results)
4. [Performance](#4-performance)
5. [Findings](#5-findings)
6. [Exit criteria](#6-exit-criteria)
7. [Known limitations](#7-known-limitations)

## 1. Summary

The final regression ran on Wed Oct 28, 2026, on `main` at `6279231` (all MVP stories merged, including the UI kit redesign #134 – #140), on a freshly reset database. **Every automated test passed**, and the §4 demo flow passed end to end. No bug was found that breaks the demo flow or a business rule, so **QA signs off for the demo** (see [§6](#6-exit-criteria)).

| | Result |
|---|---|
| Test cases in [TEST_CASES.md](TEST_CASES.md) | 67 |
| Run | 66 (62 automated, 3 manual, 1 performance) |
| Passed | 66 |
| Not run | 1, TC_API_FLOW_016 (REST Assured practice, optional) |
| Automated Playwright tests | 67: 42 API, 24 UI, 1 E2E. All passed |
| Bugs opened | 0 |

## 2. What was tested

The plan is risk-based: the effort went to the §4 demo flow and the rules that would hurt most if they broke. See the [scope table](TEST_PLAN.md#features-and-priority) for the priority of each feature.

| Level | Tool | What | Where |
|---|---|---|---|
| API | Playwright `request` | Login and auth, the main flow, the allocation rules (BR-1 – BR-8, BR-10), capacity boundaries, the change workflow (BR-15, BR-16) | `test/tests/api/` |
| UI | Playwright, page objects | Login page, the menu and guards per role, project and request forms, candidates, pending approvals and their dialogs | `test/tests/ui/` |
| E2E | Playwright | The 8 steps of the §4 demo across Ana (PM) and Igor (RM) | `test/tests/e2e/` |
| Performance | JMeter 5.6.3 | Login and the main read endpoints at 100, 1,000 and 10,000 users | `test/performance/` |
| Manual | Browser, API | Short-password change, and every menu page of every role | – |

Unit and controller tests are the developers' (`backend/src/test`, frontend `*.spec.ts`) and weren't re-run by QA. Which T-01 – T-40 case is covered where is in [TEST_CASES.md §7](TEST_CASES.md#7-coverage-of-the-original-test-matrix).

**Environment:** the full stack in Docker (`docker compose down -v && docker compose up --build`), the dev seed with the §4 personas, Chromium. Laptop: Intel Core Ultra 7 265H (16 cores), 32 GB RAM, Windows 11. Docker had 16 CPUs and 15 GB.

## 3. Results

### Automated

| Suite | Command | Tests | Passed | Time |
|---|---|---|---|---|
| Type check | `npm run typecheck` | – | Pass | – |
| API + UI | `npm test` | 66 | 66 | 1 min 41 s |
| E2E | `npm run test:e2e` | 1 | 1 | 24 s |

The API and UI suites were also run twice in a row without a reset (66/66 both times), so their clean-up works. The E2E test needs a reset before every run, see [§7](#7-known-limitations).

### Per area

| Area | Test cases | Result |
|---|---|---|
| Login and auth (API) | TC_API_AUTH_001 – 017 | All passed. Wrong password, unknown email and inactive user get the same 401 body, so login doesn't reveal whether an email exists. SQL injection is rejected. A forged token gets 401 |
| Change password, short password (API) | TC_API_AUTH_018 | Passed, manually: 400 *New password must be at least 8 characters*, and the old password still works |
| Main flow and rules (API) | TC_API_FLOW_001 – 015 | All passed |
| Capacity boundaries (API) | TC_API_FLOW_017 – 021 | All passed: boundary day 409, adjacent and weekend-only 200, part-time 50% and 80% |
| Change workflow (API) | TC_API_FLOW_022 – 024 | All passed. While a change is pending, capacity counts the old values (T-36) |
| REST Assured | TC_API_FLOW_016 | Not run, see [§7](#7-known-limitations) |
| Login page (UI) | TC_UI_LOGIN_001 – 009 | All passed |
| Menu and guards (UI) | TC_UI_NAV_001 – 004 | All passed, for all 4 roles |
| Projects, requests, candidates (UI) | TC_UI_PROJ_001 – 002, TC_UI_REQ_001, TC_UI_CAND_001 – 002 | All passed |
| Pending approvals (UI) | TC_UI_APPR_001 – 003 | All passed, including the *Not approved* capacity panel |
| Withdraw from the team panel (UI) | TC_UI_TEAM_001 | Passed, as part of TC_E2E_001 step 7 |
| Other screens (UI) | TC_UI_MISC_001 | Passed, by a script: each role opened every page of its menu (Home, My profile, My allocations, My projects, Employee search, Pending approvals, My team, Users, Departments, Skills catalog). Each page loaded with its data, and there were no API errors, console errors or error messages |
| §4 demo flow (E2E) | TC_E2E_001 | Passed, all 8 steps |
| Performance | TC_PERF_001 | Run, see [§4](#4-performance) |

## 4. Performance

TC_PERF_001: each virtual user logs in as Ana, finds one of her projects and an open request, then calls `GET /api/projects` and `GET /api/requests/{id}/candidates` 5 times. Times are in milliseconds, except where shown in seconds.

| Step | Ramp-up | Requests | Errors | Login avg / p95 | Projects avg / p95 | Candidates avg / p95 | Throughput |
|---|---|---|---|---|---|---|---|
| 100 users | 30 s | 1,300 | 0% | 121 / 133 | 13 / 15 | 21 / 29 | 44 req/s |
| 1,000 users | 120 s | 13,000 | 0% | 112 / 123 | 8 / 10 | 12 / 15 | 109 req/s |
| 10,000 users | 100 s | 130,000 | 87% | 18.8 s / 30.4 s | – | – | 180 – 195 req/s before the errors |

- **Up to 1,000 users the app is fast and error-free.** Every call except login stays under 30 ms at p95. Login is the slowest call (about 120 ms), as expected, because password hashing is deliberately slow.
- **At 10,000 users, login is the bottleneck.** Starting 100 users a second means 100 logins a second. The backend used about 11 of the 16 cores the whole run. For the first 85 seconds the error rate stayed at 0.01%, but the average response time climbed from 5 s to 24 s. After that, requests hit JMeter's 30 s timeout and new connections were refused.
- **Most of the 87% are follow-on errors.** A user whose login failed has no token, so all of its later calls fail too (401, 400). Part of the errors are the laptop's own limit: Windows ran out of client ports on the JMeter side (`BindException`).
- **The backend didn't crash.** It answered `/api/health` right after the run.

For an internal staffing tool the expected load is far below 1,000 users at once, so this is acceptable. If more is needed later, login (hashing cost, or more backend instances) is where to look. JMeter and the stack shared one laptop, so the 10,000 step shows the machine's limit as much as the app's.

## 5. Findings

No bug was found in the app that breaks the demo flow or a business rule, so no *Bug* issue was opened. The findings were:

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `POST /api/auth/login` with spaces around the email gets 400 `VALIDATION_ERROR`, because `@Email` rejects it before `AuthService.login` trims it. The `trim()` there can't be reached. The login form trims the email, so users don't see this | Low | Accepted by the team: 400 is fine. TC_API_AUTH_008 tests upper case only, and TC_UI_LOGIN_009 tests the spaces through the form |
| 2 | At 10,000 users starting within 100 s, logins saturate the backend's CPU, and requests time out | Low, for an internal tool | Recorded in [§4](#4-performance) |

The reviews of the QA pull requests (#132, #133, #142) also found mistakes in the test documents and tests: expected results that didn't match the app (exact capacity messages, the UI's capacity panel, two login results), and test data that wasn't cleaned up. They were fixed before the tests were merged, so they aren't app bugs.

## 6. Exit criteria

From [TEST_PLAN.md §5](TEST_PLAN.md#5-entry-and-exit-criteria):

| Criterion | Met |
|---|---|
| Every High priority test case has been run, and the automated ones pass | Yes. All 35 High cases ran and passed |
| The E2E demo flow passes in one run on a freshly reset database | Yes |
| No known bug breaks the demo flow or a business rule | Yes |
| The test report lists what was tested, the results, known bugs and limitations | Yes, this report |

## 7. Known limitations

- **Fixed dates.** The seed and the tests use November 2026 – January 2027. From **Nov 1, 2026** the approved allocations have started and can't be cancelled, so the tests' clean-up fails and they can't be re-run. Run them before then, or move the seed dates forward ([TEST_PLAN.md §7](TEST_PLAN.md#7-risks)).
- **The E2E test needs a reset before every run.** It leaves Marko and Jelena booked, as the demo does. After an E2E run, reset the database before `npm test`.
- **TC_API_FLOW_016 (REST Assured) wasn't written.** It was optional practice, and the developers' controller tests already use REST Assured for every controller.
- **QA-02 (#88 – #90) wasn't done** as unit tests. The developers' `CapacityServiceTests` and `MatchingServiceTests` cover the services, and the T-01 – T-06 and T-24 – T-25 scenarios are QA API cases instead (TC_API_FLOW_001, 002, 005, 006, 017 – 021).
- **Not tested:** stretch features (absences, documents, heatmap), the full role × endpoint authorization matrix, browsers other than Chromium, mobile layouts and accessibility, as the test plan's out-of-scope table says. Low-priority admin and dashboard rules (T-22, T-23, T-40) are covered by the developers' controller tests only.
- **Performance** ran on one laptop shared with the stack. The numbers show the behavior under load, not a benchmark.
