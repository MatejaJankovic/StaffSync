# Contributing

Thank you for contributing to this project.

This document defines the project's development workflow, branching strategy, pull request process, and expectations for both human contributors and AI-assisted workflows.

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
2. Repository-specific instructions (for example `AGENT.md`)
3. This `CONTRIBUTING.md`
4. General conventions and best practices

If a conflict exists, clearly identify it and follow the higher-priority instruction.

---

## GitHub Issues

Every task, bug, feature, or meaningful improvement should be associated with a GitHub Issue.

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

Create branches from `develop` unless instructed otherwise.

Branch naming:

```text
feature/<short-description>
bugfix/<short-description>
hotfix/<short-description>
docs/<short-description>
chore/<short-description>
task/<short-description>
test/<short-description>
```

Examples:

```text
feature/candidate-ranking
bugfix/capacity-validation
docs/api-setup
chore/update-environment-config
```

Keep branch names concise and descriptive.

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
```

Keep commit messages clear and focused on user-visible intent.

---

## Pull Requests

Pull requests should:

- Address a single concern whenever practical.
- Reference the related GitHub Issue.
- Include a concise description of the change.
- Explain any significant implementation decisions.
- Describe any limitations or known concerns.

Do not include unrelated modifications.

---

## Scope Control

Unless explicitly requested:

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

---

## Testing and Validation

Run relevant validation commands when possible.

Examples may include:

- Application builds
- Static analysis
- Linters
- Format checks
- Existing automated test suites

Never claim validation was performed if it was not.

Clearly report:

- What was executed
- What succeeded
- What failed
- What could not be executed

If validation cannot be completed, explain why.

---

## Releases

Release readiness is determined by the team.

Contributors must not independently decide:

- When a release should occur
- When a release pull request should be opened
- When code should be merged into `main`

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

Feedback should be constructive and actionable.

---

## Questions

If requirements, workflow expectations, or repository instructions are unclear, seek clarification before making significant changes.