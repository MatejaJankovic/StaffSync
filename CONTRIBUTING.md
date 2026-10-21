# Contributing

Thank you for contributing to StaffSync.

This document defines the project's development workflow, branching strategy, pull request process, and expectations for both human contributors and AI-assisted workflows.

The project specification is in [`docs/CLAUDE.md`](docs/CLAUDE.md), and the current sprint plan is in [`docs/SPRINT_BACKLOG.md`](docs/SPRINT_BACKLOG.md).

---

## Guiding Principles

- Keep changes small, focused, and easy to review.
- Prefer consistency over personal preference.
- Preserve existing behavior unless the change explicitly requires modification.
- Follow established project conventions.
- Link meaningful work to a GitHub Issue whenever possible.

---

## Instruction Precedence

If instructions conflict, follow them in this order:

1. Direct user, reviewer, or maintainer instructions
2. Repository-specific instructions: the project specification [`docs/CLAUDE.md`](docs/CLAUDE.md) and the sprint plan [`docs/SPRINT_BACKLOG.md`](docs/SPRINT_BACKLOG.md)
3. This `CONTRIBUTING.md`
4. General conventions and best practices

If a conflict exists, clearly identify it and follow the higher-priority instruction.

---

## GitHub Issues

Every task, bug, feature, or meaningful improvement should be associated with a GitHub Issue.

How the backlog is organized:

- A **user story** (label `user story`) describes a feature with its acceptance criteria, business rules (BR-x) and test cases (T-xx).
- Each story is split into **tasks** (label `task`). Tasks are sub-issues of their story, and each one is small enough for one commit. A story is delivered as one branch and one pull request (see [Branching Strategy](#branching-strategy)).
- Labels also show the sprint (`sprint 1`), the priority (`priority: must`, `priority: should`, `priority: could`), the layer (`backend`, `frontend`, `devops`, `qa`) and the slice.
- Create new issues from the templates in `.github/ISSUE_TEMPLATE/`: *User story*, *Task* or *Bug*. Add a new task as a sub-issue of its story.
- Report bugs with the *Bug* template, link the story, and assign the story owner.

The [project board](https://github.com/users/MatejaJankovic/projects/7) is the team dashboard for all issues:

- Move your card to *In progress* when you start working on it.
- It moves to *Done* by itself when the pull request with `Closes #N` is merged.
- Use the *Board* and *Current iteration* views day to day.

If no issue exists:

- Ask whether a GitHub Issue should be created.
- Do not assume or invent an issue number.
- If explicitly instructed to proceed without an issue, clearly state that the work is not linked to one.

When working on an issue:

- Review the issue description.
- Understand the acceptance criteria.
- Ensure the implementation aligns with the requirements.

---

## Branching Strategy

`main` is the only long-lived branch, and it must always stay stable. Create every branch from the latest `main`, and merge it back into `main` through a pull request.

**One branch per user story.** Do all the tasks of a story on that one branch, one commit per task (for example the backend, then the list page, then the details page). Do not create a branch per task. The story gets one pull request, and that is the only pull request that goes to `main`.

If two developers share a story, each can take their tasks on a short branch created from the story branch (`<type>/<task-number>-<short-description>`) and merge it into the story branch. Only the story branch is ever merged into `main`.

Branch naming:

```text
<type>/<issue-number>-<short-description>
```

Use the number of the **story** (the `user story` issue, e.g. `#14`), not of one of its tasks. For work that isn't part of a story, such as a bug or a technical task, use its own issue number.

Types:

```text
feature/   new functionality
bugfix/    a fix for a reported bug
hotfix/    an urgent fix for something broken on main
docs/      documentation only
chore/     configuration, tooling or dependencies
task/      other technical work, such as a refactoring
test/      tests only
```

Examples:

```text
feature/14-project-management
feature/32-matching-engine
task/7-api-foundation
test/88-spec-first-unit-tests
docs/85-test-plan
chore/52-demo-ready
```

Only for work that is explicitly done without an issue, leave out the number, e.g. `docs/contributing`.

Keep branch names concise and descriptive. Delete the branch after it has been merged.

---

## Commit Messages

Use Conventional Commits whenever possible.

Format:

```text
type: short description
```

Examples:

```text
feat: implement candidate ranking endpoint
fix: resolve allocation overlap validation
docs: update project setup instructions
chore: update development configuration
refactor: simplify matching service logic
test: add capacity service boundary tests
```

Keep commit messages clear and focused on user-visible intent.

Make **one commit per task** of the story, and name the story in each message, e.g. `feat: add projects API (US-04)`. Each commit should build and pass its tests on its own, so a reviewer can read the pull request commit by commit.

Pull requests are squash-merged, so the **pull request title** becomes the commit message on `main`, and the per-task commits are folded into it. Write the title in the same format.

---

## Pull Requests

Pull requests should:

- Cover one user story: all its tasks, one commit each. Keep each task small (usually one endpoint or one screen), so the pull request stays easy to review.
- Target `main`.
- Close every task of the story, one line each: `Closes #<task-number>`. Do not close the story itself. It closes when all its tasks are closed and QA has verified its acceptance criteria.
- List the tasks in the description, so the reviewer and QA know what each commit holds.
- Follow the pull request template: what changed, which business rules (BR-x) it touches, and how to test it.
- Include a concise description of the change.
- Explain any significant implementation decisions.
- Describe any limitations or known concerns.

Do not include unrelated modifications.

Approvals needed before merging:

| Pull request | Approvals |
|---|---|
| Every pull request | 1 developer, who checks the code, architecture, business rules in services, DTOs, validation and Swagger annotations |
| Feature pull request (something users see) | Also QA, who tests the branch against the spec within half a working day |
| Technical pull request (setup, configuration, refactoring) | The developer approval only |

If QA can't review within half a working day, the pull request can be merged with the developer approval, and QA tests it on `main` afterwards.

---

## Scope Control

Unless explicitly requested, either directly or by the assigned issue:

- Do not refactor unrelated code.
- Do not rename files for style preferences.
- Do not reformat unrelated files.
- Do not modify project architecture.
- Do not upgrade dependencies.
- Do not modify CI/CD configuration.
- Do not modify Docker configuration.
- Do not modify database schemas.
- Do not create new migrations.
- Do not modify existing tests.

Keep changes focused strictly on the requested task.

When a task does require a schema change, follow the Flyway rules:

- Every schema change is a new migration in `backend/src/main/resources/db/migration/`, named `V{number}__{description}.sql`.
- Never edit a migration after it has been merged.
- Reserve the next version number on the team channel before opening the pull request.
- Follow the table order in [`docs/SPRINT_BACKLOG.md`](docs/SPRINT_BACKLOG.md#flyway-migration-order): a table that references another comes after it.
- If your local database gets out of sync, reset it with `docker compose down -v`.

---

## Testing and Validation

There is no CI, so run the checks locally before opening a pull request:

| Part | Checks |
|---|---|
| Backend (`backend/`) | `mvnw.cmd verify` on Windows, `sh mvnw verify` on macOS/Linux. The tests use Testcontainers, so Docker must be running |
| Frontend (`frontend/`) | `npm run build`, `npm test`, `npm run lint`, `npm run format:check` |
| Full stack | `docker compose up --build`, for changes that affect how the services run together |

Never claim validation was performed if it was not.

Clearly report:

- What was executed
- What succeeded
- What failed
- What could not be executed

If validation cannot be completed, explain why.

A change is done when it meets the [Definition of Done](docs/SPRINT_BACKLOG.md#definition-of-done).

---

## Merging and Releases

Approved pull requests are squash-merged into `main`. `main` must always build and run.

Release readiness is determined by the team. Contributors must not independently decide:

- When the feature freeze starts (the date is in the sprint plan)
- Which build of `main` is used for the demo

After the feature freeze, only bug fixes are merged.

Release-related actions should only be performed when explicitly requested.

---

## AI-Assisted Contributions

AI agents may assist with development tasks but must operate transparently.

AI agents should:

- Review repository instructions before making changes.
- Inspect the current branch and working tree status.
- Review the relevant code before modifying it.
- Preserve unrelated user changes.
- Limit modifications to the requested scope.
- Follow the same branch, commit and pull request conventions as everyone else.
- Clearly communicate assumptions and uncertainties.

AI agents must not:

- Claim work was reviewed when it was not.
- Claim commands were executed when they were not.
- Claim tests passed when they were not run.
- Invent issue numbers, requirements, or acceptance criteria.
- Make irreversible assumptions when requirements are ambiguous.

If requirements are unclear or multiple implementations are reasonable:

- Identify the ambiguity.
- Present available options.
- Request clarification before proceeding.

Accuracy is preferred over guessing.

---

## Code Review Expectations

Reviewers should focus on:

- Correctness
- Maintainability
- Consistency
- Scope adherence
- Requirement alignment
- The [Definition of Done](docs/SPRINT_BACKLOG.md#definition-of-done)

QA's approval means "tested and works to spec", not "the code is good". The developer who reviews is responsible for code quality.

Feedback should be constructive and actionable.

---

## Questions

If requirements, workflow expectations, or repository instructions are unclear, seek clarification before making significant changes.

Ask on the team channel (Discord/Teams) or in the issue itself, and write any decision that affects a task into its issue.
