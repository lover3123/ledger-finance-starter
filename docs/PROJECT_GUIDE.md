# Ledger project guide

## What the user can do

1. Register or sign in.
2. Open the authenticated dashboard.
3. Review balance, income, expenses, and category spending.
4. Add a transaction from the dashboard.
5. Open Transactions to filter, edit, and delete records.
6. Open Budgets to create monthly spending limits.
7. Compare actual spending with each budget.
8. Return to the dashboard to see recalculated totals.

## How the code is arranged

```text
apps/web/src/
  App.tsx                         Routes and authentication check
  api.ts                          Typed browser-to-API requests
  components/                     Reusable UI pieces
  pages/                          One file per application screen
  styles.css                      Base visual styles
  motion.css                      Animation and interaction styles

apps/api/src/
  server.ts                       Express routes and application startup
  middleware/auth.ts              JWT authentication middleware
  db/index.ts                     MySQL connection pool
  db/queries.ts                   Small database query helpers
  db/migrate.ts                   Schema migration
  db/seed.ts                      Demo data

packages/shared/src/index.ts      Zod schemas and shared TypeScript types
docs/api.md                       Client-server API contract
```

## Important learning idea

TypeScript helps the developer use the correct data shape. Zod checks real data arriving at the API. Authentication identifies the user, and `user_id` makes sure database queries only return that user's records.

## Local commands

```bash
npm run setup
npm run dev
npm run build
```

Local MySQL must be running with the credentials in `apps/api/.env`.
