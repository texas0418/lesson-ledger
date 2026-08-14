# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# What Lesson Ledger is

Payment tracking and invoicing for private tutors. Students, a weekly lesson
schedule, logged lessons that accrue an unbilled balance, invoices built from
unbilled lessons (professional PDF via expo-print), and Dundue's polite
reminder ladder pointed at parents. Everything on-device (SQLite), no account,
no cloud. First student free; Pro is an auto-renewing subscription
($4.99/month or $49.99/year) that unlocks unlimited students — this is the
fleet's FIRST subscription app; everything else follows the one-time-unlock
house patterns (fail-open RevenueCat, export never gated).

# Git workflow (PR-based CI)

`main` is what ships; `dev` is the integration branch. Never commit directly to either.

1. Start every session by branching off `dev`: `git fetch origin && git checkout -b <topic> origin/dev`. Prefer an isolated worktree (`git worktree add`) when other sessions may be active.
2. When the work is done and `npm run typecheck`, `npm run lint`, and `npm test` pass locally, push and open a PR into `dev` with `gh pr create --base dev`. CI runs typecheck, lint (with cyclomatic-complexity and function-length limits), the pure-module tests, a banned-phrase slop check (`scripts/ci/slop-check.sh`), and gitleaks secret scanning.
3. Do not merge your own PR unless Simon says to; report the PR URL and CI status at the end of the session.
4. Batches of work on `dev` get promoted by a PR into `main` (ask Simon first). That runs the deeper promotion checks, including `expo-doctor`.

# Cross-session memory (GitHub Issues)

To-dos, bugs, and session handoffs live in GitHub Issues, not in README checklists or scratch files.

- Check open issues at session start: `gh issue list --state open`.
- File bugs you find but don't fix as issues; close issues you resolve, referencing the PR (`Closes #N` in the PR body).
- For handoffs, write a dense, self-contained issue comment optimized for LLM ingestion: current state, exact file paths, what was tried and rejected (and why), and the next concrete step. Assume the reader has zero conversation context.
- Pre-ship checklist items carry the `pre-ship` label.
