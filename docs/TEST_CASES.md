# StaffSync: Test cases

> Belongs to the [test plan](TEST_PLAN.md). Business rules (BR-x) and the original test matrix (T-xx) are in [docs/CLAUDE.md](CLAUDE.md) §6 and §16.
> Every account has the password `Password123!`. Personas and environment: [test plan §4](TEST_PLAN.md#4-test-environment-and-data).

**Columns**

- **Type:** Positive, Negative, Boundary, Security or Performance
- **Priority:** High cases run before the demo. Medium if time allows. Low only in exploratory testing
- **Ref:** the story (US-xx), business rule (BR-x) or original matrix case (T-xx)
- **Automated:** the spec file in `test/` that automates the case, or *Manual*

Results aren't kept here. They go into the test report.

## Contents

1. [API: Authentication](#1-api-authentication)
2. [API: Main flow and allocation rules](#2-api-main-flow-and-allocation-rules)
3. [UI: Login and navigation](#3-ui-login-and-navigation)
4. [UI: Main flow screens](#4-ui-main-flow-screens)
5. [E2E: Demo scenario](#5-e2e-demo-scenario)
6. [Performance](#6-performance)
7. [Coverage of the original test matrix](#7-coverage-of-the-original-test-matrix)

## 1. API: Authentication

Endpoint: `POST /api/auth/login` with body `{ "email": "...", "password": "..." }`, unless the case says otherwise.

| ID | Scenario | Preconditions | Test data | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|
| TC_API_AUTH_001 | Login with valid credentials | – | `ana_pm@staffsync.local` / `Password123!` | 200. Body has a `token` and the user with role `PM`. No password or hash in the body | Positive | High | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_002 | Valid email, wrong password | – | `ana_pm@staffsync.local` / `WrongPass1!` | 401, `code` = `UNAUTHORIZED`, `message` = `Invalid email or password` | Negative | High | T-27 | `tests/api/login.spec.ts` |
| TC_API_AUTH_003 | Unknown email, any password | – | `nobody@staffsync.local` / `Password123!` | 401 with exactly the same `code` and `message` as TC_API_AUTH_002, so it doesn't reveal whether the email exists | Security | High | T-27 | `tests/api/login.spec.ts` |
| TC_API_AUTH_004 | Unknown email and wrong password | – | `nobody@staffsync.local` / `WrongPass1!` | 401, same body as TC_API_AUTH_002 | Negative | Medium | T-27 | `tests/api/login.spec.ts` |
| TC_API_AUTH_005 | Inactive user logs in | Admin has deactivated a user with no allocations | That user's email / `Password123!` | 401, same body as TC_API_AUTH_002 | Negative | Medium | T-37 | `tests/api/login.spec.ts` |
| TC_API_AUTH_006 | Empty email and password | – | `""` / `""` | 400, `code` = `VALIDATION_ERROR`, `details` names the fields `email` and `password` | Negative | High | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_007 | Invalid email format | – | `ana_pm` / `Password123!` | 400, `VALIDATION_ERROR` for the field `email` | Negative | Medium | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_008 | Email in upper case | – | `ANA_PM@STAFFSYNC.LOCAL` / `Password123!` | 200. Email matching ignores case. Spaces around the email are a 400 `VALIDATION_ERROR` at API level (`@Email`), the login form trims them (TC_UI_LOGIN_009) | Boundary | Medium | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_009 | Password in the wrong case | – | `ana_pm@staffsync.local` / `PASSWORD123!` | 401. Passwords are case-sensitive | Negative | Medium | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_010 | SQL injection in the email | – | `' OR '1'='1' --` / `x` | 400, `VALIDATION_ERROR` for the field `email` (not a valid email). Never 200 or 500 | Security | High | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_011 | SQL injection in the password | – | `ana_pm@staffsync.local` / `' OR '1'='1' --` | 401, same body as TC_API_AUTH_002 | Security | High | US-01 | `tests/api/login.spec.ts` |
| TC_API_AUTH_012 | Malformed JSON body | – | `{ "email": ` | 400, `code` = `BAD_REQUEST`, no stack trace in the body | Negative | Low | US-02 | `tests/api/login.spec.ts` |
| TC_API_AUTH_013 | Current user with a valid token | Logged in as Ana | `GET /api/auth/me` with `Authorization: Bearer <token>` | 200, Ana's data and role `PM` | Positive | High | US-01 | `tests/api/auth.spec.ts` |
| TC_API_AUTH_014 | Protected endpoint without a token | – | `GET /api/auth/me`, no header | 401, `code` = `UNAUTHORIZED` | Security | High | T-39 | `tests/api/auth.spec.ts` |
| TC_API_AUTH_015 | Protected endpoint with an invalid token | – | `GET /api/auth/me` with `Bearer abc.def.ghi`, or a valid token with one character changed | 401, `code` = `UNAUTHORIZED` | Security | High | T-26 | `tests/api/auth.spec.ts` |
| TC_API_AUTH_016 | Wrong role on an endpoint | Logged in as Marko (EMPLOYEE) | `GET /api/users` (ADMIN and RM only) | 403, `code` = `FORBIDDEN` | Security | Medium | US-01 | `tests/api/auth.spec.ts` |
| TC_API_AUTH_017 | Change password with a wrong current password | Logged in as Marko | `PUT /api/auth/password` with `oldPassword` = `WrongPass1!` | 400, `code` = `WRONG_PASSWORD`, `message` = `Current password is incorrect` | Negative | Medium | T-38 | `tests/api/auth.spec.ts` |
| TC_API_AUTH_018 | Change password to one that is too short | Logged in as Marko | `newPassword` = `Short1!` (7 characters) | 400, `VALIDATION_ERROR`: *New password must be at least 8 characters* | Boundary | Low | US-19 | Manual |

## 2. API: Main flow and allocation rules

These cases use the §4 demo data on a freshly reset database (see [test plan §4](TEST_PLAN.md#4-test-environment-and-data)). Unless stated otherwise, the PM is Ana and the RM is Igor. The setup (project and requests) is created through the API.

**Setup used by the cases below:** a project (Nov 1, 2026 – Mar 31, 2027) and a request *Java Developer*, MEDIOR, 60%, Nov 1, 2026 – Jan 31, 2027, headcount 2, Java ≥ 4 and Spring ≥ 3 required, PostgreSQL ≥ 2 nice to have. The boundary cases (TC_API_FLOW_006 and 017 – 023) each create **their own request** with the same period and skills, so they don't fill the main request or overlap each other (BR-8). At the end, each one withdraws or cancels the allocations it created, so capacity is clean for the next case. Every `change-request` has a valid `reason` (10 characters or more) unless the case says otherwise, because without one the API answers 400 before any other check.

| ID | Scenario | Preconditions | Test data | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|
| TC_API_FLOW_001 | Ranked candidates for the request | Setup | `GET /api/requests/{id}/candidates` as Ana | 200. Marko is first with score 85, and Jelena has 67 with the warning *Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)*. Scores are in descending order | Positive | High | US-09, §8 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_002 | Employee without a mandatory skill isn't a candidate | Setup | Same call | Nobody in the list is missing Java ≥ 4 or Spring ≥ 3 | Negative | Medium | T-24 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_003 | PM proposes an employee | Setup | `POST /api/allocations` for Marko, whole period | 201, status `PROPOSED`, `percent` = 60 | Positive | High | US-08 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_004 | RM approves within capacity | TC_API_FLOW_003 | `POST /api/allocations/{id}/approve` as Igor | 200, status `APPROVED`. The request is `PARTIALLY_FILLED` | Positive | High | US-10, BR-10 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_005 | Approve over capacity | Jelena proposed for the whole period | `approve` as Igor | 409, `code` = `CAPACITY_EXCEEDED`, `message` = `Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)`. Jelena stays `PROPOSED` | Negative | High | BR-1, T-02 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_006 | Approve at exactly 100% | Jelena (60% busy until Nov 14) proposed at 40% for Nov 2 – Nov 13 on a separate request | `approve` as Igor | 200, `APPROVED`. Exactly 100% is allowed | Boundary | High | BR-1, T-01 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_007 | RM of another team approves | Marko proposed | `approve` as Lazar | 403, `code` = `NOT_RESOURCE_MANAGER` | Security | High | BR-5, T-12 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_008 | Employee tries to approve | Marko proposed | `approve` as Marko | 403, `code` = `FORBIDDEN` | Security | Medium | BR-5, T-13 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_009 | PM proposes on another PM's project | Setup (Ana's project) | `POST /api/allocations` as Mateja (PM) | 403, `code` = `NOT_PROJECT_OWNER` | Security | Medium | BR-4, T-11 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_010 | Reject with a comment shorter than 10 characters | Marko proposed | `POST /api/allocations/{id}/reject` with `comment` = `Too busy` (8 characters) | 400, `VALIDATION_ERROR`. Marko stays `PROPOSED` | Boundary | High | BR-6, T-14 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_011 | Approve an allocation that is already approved | TC_API_FLOW_004 | `approve` again as Igor | 409, `code` = `INVALID_ALLOCATION_STATUS` | Negative | Medium | BR-7, T-15 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_012 | Same employee proposed twice on the same request | Marko proposed | Propose Marko again, overlapping period | 409, `code` = `ALLOCATION_OVERLAP` | Negative | Medium | BR-8, T-16 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_013 | Allocation period outside the request | Setup | Propose with `startDate` = 2026-10-15 | 400, `code` = `ALLOCATION_OUTSIDE_REQUEST` | Negative | Medium | BR-3, T-09 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_014 | Change request 60% → 80%, approved by the RM | Marko `APPROVED` at 60% | `POST /api/allocations/{id}/change-request` with `percent` = 80 and a reason, then `approve` as Igor | After the change request: `CHANGE_PENDING`, still 60%, and Igor's pending list has it with `type` = `CHANGE`. After approve: `APPROVED` at 80% | Positive | High | US-13, BR-15, T-29 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_015 | Second change while one is pending | Marko `CHANGE_PENDING` | Another `change-request` | 409, `code` = `CHANGE_ALREADY_PENDING` | Negative | Medium | BR-15, T-31 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_016 | REST Assured: login and one allocation rule | – | TC_API_AUTH_001, TC_API_AUTH_003 and TC_API_FLOW_005 written in REST Assured | Same results as the Playwright tests | Positive / Negative | Medium | Practice | `backend/.../qa/*Tests.java` |
| TC_API_FLOW_017 | Overlap on the last working day of the existing allocation (Helios ends on a Saturday, so the literal boundary day is TC_API_FLOW_019) | Jelena's Helios 60% ends Sat Nov 14 | Propose Jelena at 60% for Nov 13 – Jan 31, `approve` as Igor | 409, `CAPACITY_EXCEEDED`, `message` = `Capacity exceeded on 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)`: only Fri Nov 13 | Boundary | High | BR-1, T-03 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_018 | Adjacent periods | Same | Propose Jelena at 60% for Nov 15 – Jan 31, `approve` as Igor | 200, `APPROVED`. The periods don't overlap | Boundary | High | BR-1, T-04 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_019 | Overlap only on a weekend | Same | Propose Jelena at 60% for Nov 14 – Jan 31, `approve` as Igor | 200, `APPROVED`. The only shared day is Saturday, which doesn't count | Boundary | High | BR-1, T-06 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_020 | Part-time 50% employee over capacity | Stefan (50%) has a PROPOSED 50% from the seed | Propose Stefan at 60% for Nov 2 – Jan 29, `approve` as Lazar | 409, `CAPACITY_EXCEEDED`, `message` = `Capacity exceeded on 2026-11-02 – 2027-01-29 (0% existing + 60% new = 60% of 50% capacity)`. His PROPOSED 50% isn't counted | Boundary | High | BR-1, BR-2, T-05 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_021 | Part-time 80% employee at and over capacity | Milica (80%) is APPROVED 50% Dec 1 – Jan 29 | Propose Milica at 30% for Dec 1 – Jan 29, `approve` as Lazar. Cancel it, then the same at 40% | 30%: 200, `APPROVED` (exactly 80%). 40%: 409, `CAPACITY_EXCEEDED`, `message` = `Capacity exceeded on 2026-12-01 – 2027-01-29 (50% existing + 40% new = 90% of 80% capacity)` | Boundary | Medium | BR-1, T-01 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_022 | Capacity uses the old values while a change is pending | Marko `CHANGE_PENDING` 60% → 80% on the main request (TC_API_FLOW_014 before the approve) | Propose Marko at 40% for Nov 1 – Jan 31 on this case's own request, `approve` as Igor | 200, `APPROVED` (60% + 40% = 100%). The pending 80% isn't counted | Boundary | High | BR-16, T-36 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_023 | Approve a change that goes over capacity | Jelena `APPROVED` at 40% for Nov 2 – 13, as in TC_API_FLOW_006 | `change-request` to 60%, then `approve` as Igor | 409, `CAPACITY_EXCEEDED`, `message` = `Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)`: her own 40% isn't counted. Jelena stays `CHANGE_PENDING` at 40%, and the change is still in Igor's pending list | Negative | Medium | BR-15, BR-1, T-30 | `tests/api/allocations.spec.ts` |
| TC_API_FLOW_024 | Change request on a proposal | Marko `PROPOSED` | `change-request` with `percent` = 80 and `reason` = `Client needs more work` | 409, `code` = `INVALID_ALLOCATION_STATUS` | Negative | Low | BR-15, T-33 | `tests/api/allocations.spec.ts` |

## 3. UI: Login and navigation

| ID | Scenario | Preconditions | Steps | Test data | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|---|
| TC_UI_LOGIN_001 | Login with valid credentials | On `/login` | Enter email and password → *Sign in* | `ana_pm@staffsync.local` / `Password123!` | Redirected to *Home*, and the menu shows *My projects* | Positive | High | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_002 | Wrong password | On `/login` | Enter credentials → *Sign in* | `ana_pm@staffsync.local` / `WrongPass1!` | Error *Invalid email or password.* is shown, and the user stays on `/login` | Negative | High | T-27 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_003 | Unknown email | On `/login` | Enter credentials → *Sign in* | `nobody@staffsync.local` / `Password123!` | The same error as TC_UI_LOGIN_002 | Security | High | T-27 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_004 | Empty fields | On `/login` | Click *Sign in* without typing | Empty / Empty | *Email is required* and *Password is required* are shown, and no request is sent | Negative | High | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_005 | Invalid email format | On `/login` | Type an email, leave the field | `ana_pm` | *Enter a valid email address* | Negative | Medium | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_006 | Password is masked and can be shown | On `/login` | Type a password, click the eye icon, click it again | `Password123!` | Hidden at first, visible after the first click, hidden after the second | Positive | Medium | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_007 | Submit with the Enter key | On `/login` | Enter credentials, press Enter in the password field | Valid credentials | Logged in, like with the button | Positive | Medium | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_008 | Correct the credentials after an error | TC_UI_LOGIN_002 | Enter the right password → *Sign in* | `Password123!` | Logged in | Positive | Low | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_LOGIN_009 | Email with spaces around it and in upper case | On `/login` | Enter credentials → *Sign in* | `  ANA_PM@STAFFSYNC.LOCAL  ` / `Password123!` | Logged in. The form trims the email before sending it | Boundary | Low | US-01 | `tests/ui/login.spec.ts` |
| TC_UI_NAV_001 | Menu per role | – | Log in as each role | Ana (PM), Igor (RM), Marko (EMPLOYEE), Vukasin (ADMIN) | PM: Home, My projects, Employee search. RM: Home, Pending approvals, My team, Employee search. EMPLOYEE: Home, My profile, My allocations. ADMIN: Home, Users, Departments, Skills catalog | Positive | High | US-01 | `tests/ui/navigation.spec.ts` |
| TC_UI_NAV_002 | Protected page without logging in | Logged out | Open `/projects` directly | – | Redirected to `/login` | Security | High | US-01 | `tests/ui/navigation.spec.ts` |
| TC_UI_NAV_003 | Page of another role | Logged in as Ana (PM) | Open `/admin/users` directly | – | Redirected to `/home` | Security | High | US-01 | `tests/ui/navigation.spec.ts` |
| TC_UI_NAV_004 | Logout | Logged in | User menu → *Logout*, then press browser Back | – | On `/login`. Back doesn't open the app again | Positive | Medium | US-01 | `tests/ui/navigation.spec.ts` |

## 4. UI: Main flow screens

| ID | Scenario | Preconditions | Steps | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|
| TC_UI_PROJ_001 | Create a project | Logged in as Ana | *My projects* → *New project* → fill in name, client, dates → *Save* | *Project created*, and the project is in the list as *Planned* | Positive | High | US-04 | `tests/ui/projects.spec.ts` |
| TC_UI_PROJ_002 | Project form validation | *New project* dialog open | Leave the name empty, set the end date before the start date | Validation errors are shown and *Save* doesn't create the project | Negative | Medium | US-04, BR-3 | `tests/ui/projects.spec.ts` |
| TC_UI_REQ_001 | Create a staffing request with skills | Ana's project exists | *New request* → title, seniority, 60%, headcount 2, dates, *Add skill* three times → *Save* | The request is on the project as *Open* | Positive | High | US-05 | `tests/ui/requests.spec.ts` |
| TC_UI_CAND_001 | Candidates page shows the ranking | Request from TC_UI_REQ_001 | *Find candidates* | Candidates in score order, each with its score breakdown, reasons and warnings. Marko 85 is first | Positive | High | US-11 | `tests/ui/candidates.spec.ts` |
| TC_UI_CAND_002 | Propose dialog is pre-filled and shows the candidate's warning | Candidates page open | *Propose* on Jelena | The dialog has the request's period and 60%, and shows Jelena's capacity warning from matching | Positive | Medium | US-11 | `tests/ui/candidates.spec.ts` |
| TC_UI_APPR_001 | Pending approvals show New and Change | Igor has one new proposal and one pending change | Log in as Igor → *Pending approvals* | One item is marked *New*. The other is marked *Change* and shows old → new values | Positive | High | US-14 | `tests/ui/approvals.spec.ts` |
| TC_UI_APPR_002 | Capacity error is shown on approve | Jelena proposed for the whole period | Igor → *Approve* Jelena → *Approve* in the confirmation dialog | A red panel above the list: *Not approved: Jelena Petrovic would be over capacity on 10 working days*, with the line *2 Nov 2026 – 13 Nov 2026 60% existing + 60% new = 120%*. Jelena stays in the list | Negative | High | BR-1 | `tests/ui/approvals.spec.ts` |
| TC_UI_APPR_003 | Reject needs a comment | A proposal is pending | *Reject* → leave the comment empty or type fewer than 10 characters | The dialog shows a validation error and doesn't reject | Negative | Medium | BR-6 | `tests/ui/approvals.spec.ts` |
| TC_UI_TEAM_001 | Withdraw a proposal from the team panel | A proposal exists on Ana's project | Project details → *Team* → *Withdraw* → confirm | The allocation is *Cancelled* | Positive | Medium | US-12 | Manual |
| TC_UI_MISC_001 | Low-priority screens work | Logged in as each role | Home cards, My team, My allocations, Employee search, admin pages | Pages load without errors and show the seeded data | Positive | Low | US-16 – US-23 | Manual |

## 5. E2E: Demo scenario

| ID | Scenario | Preconditions | Steps | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|
| TC_E2E_001 | The §4 demo flow across roles | Freshly reset database (`docker compose down -v && docker compose up --build`), demo seed | 1. Ana creates *Project Alpha* (Nov 1 – Mar 31).<br>2. Ana creates the *Java Developer* request (MEDIOR, 60%, Nov 1 – Jan 31, headcount 2, Java ≥ 4, Spring ≥ 3, PostgreSQL ≥ 2 nice to have).<br>3. Ana opens the candidates.<br>4. Ana proposes Marko.<br>5. Igor approves Marko (every *Approve* is confirmed in the dialog).<br>6. Ana proposes Jelena for the whole period, Igor tries to approve.<br>7. Ana withdraws Jelena and proposes her for Nov 15 – Jan 31, Igor approves.<br>8. Ana requests 60% → 80% for Marko, Igor approves the change | 1. Project is *Planned*.<br>2. Request is *Open*.<br>3. Marko 85 above Jelena 67, with Jelena's capacity warning.<br>4. Marko *Proposed*.<br>5. Marko *Approved*, request *Partially filled*.<br>6. Panel *Not approved: Jelena Petrovic would be over capacity on 10 working days* with *2 Nov 2026 – 13 Nov 2026 60% existing + 60% new = 120%*, Jelena stays *Proposed*.<br>7. Jelena *Approved*, request *Filled*.<br>8. Igor sees *Change* 60% → 80%. Marko is *Approved* at 80% | Positive | High | US-15, §4 | `tests/e2e/demo-flow.spec.ts` |

## 6. Performance

| ID | Scenario | Preconditions | Test data | Expected result | Type | Priority | Ref | Automated |
|---|---|---|---|---|---|---|---|---|
| TC_PERF_001 | Load on login and the main read endpoints | Full stack running, nothing else under load | JMeter in non-GUI mode (`jmeter -n -t staffsync.jmx -l results.jtl -e -o report/`), in steps of 100, 1,000 and 10,000 virtual users. Each logs in once, then calls `GET /api/projects` and `GET /api/requests/{id}/candidates`. Stop at the step where the error rate climbs | The report shows the average and 95th percentile response times, throughput and error rate per step, and the machine it ran on (CPU, RAM). JMeter and the stack share one machine, so the highest steps can show the machine's limit rather than the app's. The goal is to see the behavior, so there is no hard pass/fail threshold. Login is expected to be the slowest call, because password hashing is deliberately slow | Performance | Low | – | `performance/staffsync.jmx` |

## 7. Coverage of the original test matrix

How the T-xx cases from §16 are covered in this sprint. *Issue* is the QA issue that tracks the case. *Developer tests* are the existing tests in `backend/src/test`.

| T-xx | Covered by QA in | Developer tests | Issue |
|---|---|---|---|
| T-01 | TC_API_FLOW_006, TC_API_FLOW_021 (part-time) | | #94 |
| T-02 | TC_API_FLOW_005 | | #94 |
| T-03 | TC_API_FLOW_017 | `AllocationRepositoryTests` (the overlap query only) | #94 |
| T-04 | TC_API_FLOW_018 | `AllocationRepositoryTests` (the overlap query only) | #94 |
| T-05 | TC_API_FLOW_020 | `CapacityServiceTests` | #94 |
| T-06 | TC_API_FLOW_019 | `CapacityServiceTests` (working days only) | #94 |
| T-07, T-28 | – | – | Stretch, out of this sprint |
| T-08 | – | `AllocationControllerTests` (201 with a warning) | #94, not automated by QA |
| T-09 | TC_API_FLOW_013 | | #94 |
| T-10 | – | `AllocationServiceTests`, `AllocationControllerTests` | #94, not automated by QA |
| T-11 – T-16 | TC_API_FLOW_009, 007, 008, 010, 011, 012 | | #94 |
| T-17, T-18, T-20 – T-23 | Exploratory | `AllocationControllerTests`, `AllocationServiceTests`, `ProjectControllerTests`, `UserControllerTests` | #94, not automated by QA |
| T-19 | TC_E2E_001 (step 7) | `RequestStatusServiceTests`, `AllocationControllerTests` | #98 |
| T-24, T-25 | TC_API_FLOW_002, TC_API_FLOW_001 | `MatchingServiceTests` | #94 |
| T-26 | TC_API_AUTH_015 (invalid token) | `AuthControllerTests` (expired token) | #93 |
| T-27, T-37, T-38 | TC_API_AUTH_002 – 005, TC_API_AUTH_017, TC_UI_LOGIN_002, TC_UI_LOGIN_003 | | #93 |
| T-29, T-31 | TC_API_FLOW_014, TC_API_FLOW_015 | | #95 |
| T-30 | TC_API_FLOW_023 | `AllocationServiceTests` | #95 |
| T-32 | – | `AllocationServiceTests`. Two codes: the change request is 400 `ALLOCATION_ALREADY_STARTED`, and approving such a change after the start date is 409 with the same code | #95, not automated by QA |
| T-33 | TC_API_FLOW_024 | `AllocationServiceTests` | #95 |
| T-34, T-35 | – | `AllocationControllerTests` | #95, not automated by QA |
| T-36 | TC_API_FLOW_022 (capacity uses the old values) | `AllocationControllerTests`, `RequestStatusServiceTests` (the request stays FILLED) | #95 |
| T-39 | TC_API_AUTH_014 (no token) | `OpenApiDocsTests` (Swagger UI) | #93 |
| T-40 | TC_UI_MISC_001 (manual) | `DashboardControllerTests` | #99 |

The full authorization matrix (every endpoint × every role) isn't part of this sprint. The key checks are TC_API_AUTH_014 – 016 and TC_API_FLOW_007 – 009.
