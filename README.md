# Budu

Realtime budget tracking: upload a planned budget, then compare it with read-only realized expenses copied from Kitsas.

## Run locally

1. Start PostgreSQL with `docker compose up -d postgres`.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.
3. Create the schema with `pnpm prisma migrate deploy`.
4. Run `pnpm dev`.

The included Postgres container is exposed at `127.0.0.1:5436`, so it can run alongside Klapi’s database on port 5432.

## Budget file format

The first worksheet in a `.csv`, `.xls`, or `.xlsx` file is imported. Budu supports both a simple header-row format and the multi-year Finnish Talousarvio layout.

For the simple format, use these headers:

| Header | Required | Meaning |
| --- | --- | --- |
| `category` | Yes | Display name of the budget category |
| `planned` | Yes | Planned amount in euros |
| `account` | For Kitsas sync | Kitsas expense account number to match |
| `description` | No | Internal description |
| `budget_name` | No | Default budget title |
| `currency` | No | Defaults to `EUR` |

Importing a file creates a new budget; it does not discard prior local budgets or expenses.

For the Talousarvio layout, Budu identifies the rightmost year (for example `2026`), reads account rows from `tilinumero`/column B, and treats that account number as the Kitsas match key. Rows with an empty budget amount are imported as €0, so matching remains complete.

## Kitsas safety contract

The integration makes only `GET` requests to the legacy documented voucher endpoints:

- `GET /tositteet?alkupvm=…&loppupvm=…`
- `GET /tositteet/{id}`

It has no methods capable of posting, editing, or deleting anything in Kitsas. Budu stores its own copy of matched debit entries in PostgreSQL. Set `KITSAS_API_URL` to the specific cloud URL, `KITSAS_TOKEN`, and `KITSAS_EXPENSES_PATH=/tositteet` only after validating the credentials with a non-production book.

The newer [`kitsas-library`](https://github.com/Kitsas-Oy/kitsaslibrary) is a useful official client for Hub login and book/account discovery. Its documented book interface does not expose voucher retrieval, so Budu uses the documented read-only voucher API for realized-expense ingestion.

`GET /api/kitsas/discover` uses the official Hub client to read the available books, accounts, dimensions, and fiscal years. Set the `KITSAS_HUB_*` variables to use it. The mock connection is covered by `pnpm test:kitsas-mock` and uses no network or real Kitsas data.

Kitsas sync fetches the current budget period through today and the equivalent date range one year earlier. The dashboard compares each mapped account's budget, current-period realization, and same-period-prior-year realization. Expense lines use debit entries; income lines (3000–3999) use credit entries.

## Vercel

Budu is linked to the `pitvaeltajats-projects/budu` Vercel project. Klapi’s Google OAuth client ID and secret were copied to Budu’s production, preview, and development environments. Budu has its own generated `AUTH_SECRET`; Klapi’s database URL and AWS credentials were intentionally not copied.
