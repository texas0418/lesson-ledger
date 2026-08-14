# Lesson Ledger

Payment tracking and invoicing for private tutors — students, schedule,
payments, and a professional payment reminder + invoice PDF you can send in
two taps. Everything lives on your phone: no account, no cloud, works offline.

Your first student is free, every feature included. Lesson Ledger Pro
($4.99/month or $49.99/year) unlocks unlimited students.

Built with Expo SDK 57 / React Native. Data in on-device SQLite; versioned
JSON backups you keep wherever you like.

## Development

```
npm install
npm run typecheck
npm run lint
npm test
```

Pure modules (`src/models.ts`, `src/dbCore.ts`, `src/backupFormat.ts`,
`src/messages.ts`, `src/invoiceHtml.ts`) are tested in Node against
`node:sqlite` — no simulator needed. See `AGENTS.md` for the PR workflow.
