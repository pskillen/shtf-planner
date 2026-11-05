---
name: tickets
description: How issues, epics, labels and milestones work in this repo. Use when filing, shaping, triaging or closing a GitHub issue, picking what to build next, or deciding where a gap or follow-up goes.
---

# Tickets in SHTF Planner

Additive to your usual ticket process (`core:make-a-plan`, `core:multi-phase-plan`, `core:git-workflow`): those say how to plan and ship;
this says what a ticket looks like here. GitHub issues are the backlog, and issue numbers are the only names for work (no P-numbers for new work).

## Shape

- **Epic**: a themed group of features. Title `Epic: <theme>`, label `epic`, body = a one-paragraph summary and a task list (`- [ ] #n title`) under
  `## Features`. It is closed when every feature is closed.
- **Feature**: one PR, or a short stack. Title is the outcome in plain words, no `feat:` prefix, no phase number. Body opens with `Part of #<epic>.`
- **Bug / debt**: same shape; label `bug` (wrong behaviour) or `debt` (internal, nothing user-visible changes). Body gives the failure scenario
  for a bug.
- **Not tickets**: objectives (tagging a release, "get to 0.1.0"), clean-up chores, and anything that is one command.

## Labels and milestones

- Type: `epic`, `feature`, `bug`, `debt`, `content` (pack or guidance data, not code), `accessibility`, `documentation`. Exactly one type per issue
  (`content` and `accessibility` may sit beside `feature`).
- Area: one `area:<name>` per issue. The names are the hubs in `docs/features/` (`app-shell`, `data-model`, `content-packs`, `engine`, `setup`,
  `inventory`, `gaps-and-score`, `drive-sync`) plus `scanning`, `review`, `checklists`, `platform`. A new feature hub earns a new area label.
- Every issue has a milestone: `0.1.0`, `0.2.0`, `0.3.0` or `Backlog`. A milestone is a release that ships to prod; `Backlog` is unscheduled. The
  open issues of the next milestone are the work to pick from.

## Working a ticket

1. Branch `pskil/<slug>`; the PR body says `Closes #n` for a feature or bug, and `Part of #n` when the PR is one slice of a larger ticket.
2. The PR ships its docs (`docs/features/`) as AGENTS.md says. A hub's status line changes in the PR that changes the behaviour.
3. Ticking the epic's box needs nothing: GitHub ticks `- [ ] #n` when #n closes.
4. A finding while working that is not part of the ticket becomes a new issue (area, type, milestone), not a line in a file. State its number in the PR.

## Delivery notes stay in `tmp/`

Agents mid-delivery keep `gaps.md`, `follow-ups.md` and decisions in their own `tmp/<slug>/` directory. Those files are working notes, not the
backlog. A note moves to an issue when the owner agrees it is real work, or when the delivery ends and the notes are transcribed. Nothing in
`tmp/` is a ticket until it has an issue number.

## Releases

Release notes are GitHub Releases, generated from merged PR titles; keep PR titles conventional (`feat(scope): ...`). The issue list is not the
changelog, and the repo has no changelog or status file.
