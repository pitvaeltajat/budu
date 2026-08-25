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

| Header        | Required        | Meaning                                |
| ------------- | --------------- | -------------------------------------- |
| `category`    | Yes             | Display name of the budget category    |
| `planned`     | Yes             | Planned amount in euros                |
| `account`     | For Kitsas sync | Kitsas expense account number to match |
| `description` | No              | Internal description                   |
| `budget_name` | No              | Default budget title                   |
| `currency`    | No              | Defaults to `EUR`                      |

Importing a file creates a new budget; it does not discard prior local budgets or expenses.

For the Talousarvio layout, Budu identifies the rightmost year (for example `2026`), reads account rows from `tilinumero`/column B, and treats that account number as the Kitsas match key. Headings in the sheet are ignored: section names and their order are fixed in `lib/budget-sections.ts`, keyed by account-number range, because the association's budget has a settled shape and the account number is the single source of truth. An account outside every stated range is kept and shown under "Muut erät" rather than dropped. `pnpm test:sections` checks the ranges do not overlap and that known accounts land where the budget expects. Rows with an empty budget amount are imported as €0, so matching remains complete.

## Kitsas safety contract

The integration makes only `GET` requests to the legacy voucher endpoints:

- `GET /tositteet?alkupvm=…&loppupvm=…`
- `GET /tositteet/{id}`

It has no methods capable of posting, editing, or deleting anything in Kitsas. Budu stores its own copy of matched debit entries in PostgreSQL.

Kitsas exposes two hosts, and they are not interchangeable:

| Host                                                   | Variables                                                      | Serves                                               |
| ------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------- |
| KitsasHub (`api.kitsas.fi`, test `test-api.kitsas.fi`) | `KITSAS_HUB_*`                                                 | Login, books, accounts, dimensions, fiscal years     |
| Legacy per-book cloud backend                          | resolved at runtime; `KITSAS_CLOUD_ID`, `KITSAS_EXPENSES_PATH` | `GET /init`, `GET /tositteet`, `GET /tositteet/{id}` |

The documented Hub API has no voucher read endpoint — only `POST /v1/vouchers`, which Budu never calls. Realized-expense ingestion therefore uses the legacy cloud backend, which Kitsas confirmed is alive and usable.

The cloud URL and token are **not** configured by hand. `lib/kitsas-cloud.ts` resolves them at runtime: `POST {hub}/login` with `KITSAS_HUB_USERNAME`/`KITSAS_HUB_PASSWORD` returns `clouds[]`, each entry carrying `id` (the cloudid), `url`, and `token`. `KITSAS_CLOUD_ID` selects a specific book when the user has several; otherwise the first active cloud wins. The resolved token is cached in memory for ten minutes, since the compatibility login response documents no lifetime.

That login is the integration's only non-`GET` request, and it is authentication rather than a data mutation. Everything touching bookkeeping data lives in `lib/kitsas.ts` and is `GET`-only. Tokens are sent as `Bearer <token>`; a value already carrying a scheme passes through unchanged.

`KITSAS_API_URL` and `KITSAS_TOKEN` remain as an optional manual override that skips the login, for when the cloud URL is already known.

### Verified voucher shape

Confirmed against a test book on 2026-08-24. `GET /tositteet?alkupvm=…&loppupvm=…` returns list items of `{id, pvm, tyyppi, tila, tunniste, otsikko, summa}`; the per-entry account breakdown requires `GET /tositteet/{id}`, whose `viennit[]` entries carry:

| Field              | Type                | Note                                                                          |
| ------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `id`               | number              | Unique per book, not per voucher; Budu keys on `{voucherId}:{entryId}` anyway |
| `tili`             | number              | Account number                                                                |
| `debet` / `kredit` | decimal **string**  | Only one of the two is present; the other is absent, not zero                 |
| `pvm`              | `YYYY-MM-DD` string | Per entry, falling back to the voucher's `pvm`                                |
| `selite`           | string              | Entry description                                                             |

Amounts arriving as strings is why `asNumber` in the sync route parses rather than casts. A debit-side entry has no `kredit` key at all, so the unused side is `NaN` and the entry is skipped — that is what keeps the bank contra entry out of the totals.

Note that voucher detail is an N+1 fetch: one request per voucher in the range. That is fine for an association's books and would need batching for a larger one.

### Scheduled sync

`vercel.json` runs two crons, both daily because Hobby plans reject anything more frequent at deploy time: a full sync at 03:30 and an incremental pass at 15:00. Both hit `GET /api/cron/kitsas`, which requires `Authorization: Bearer $CRON_SECRET` and refuses to run at all when `CRON_SECRET` is unset, rather than quietly running unauthenticated against an external service.

Rotating `CRON_SECRET` requires a **fresh build**, not `vercel redeploy`. Vercel sends the project's current value when it triggers a cron, but the function compares against the value snapshotted into its deployment at build time, and `redeploy` reuses that snapshot. Change the secret without rebuilding and every cron run fails with `Unauthorized` while the variable looks correct in the dashboard.

The incremental pass diffs the cheap list endpoint against `KitsasVoucherState` and fetches detail only for vouchers whose total, date, or title moved. An edit that leaves all three untouched is invisible to it, which is what the full sync is for. Only the full sync prunes deleted vouchers: an incremental run sees one slice of the book and cannot conclude from that alone that a voucher is gone.

### Attachments

Invoice files are retrievable but cannot be linked to directly. Voucher detail carries `liitteet` as `[{id, nimi, tyyppi}]`, `GET /liitteet?alkupvm=…&loppupvm=…` lists them, and `GET /liitteet/{id}` returns the bytes as `image/jpeg`, `image/png`, `application/pdf`, or `text/csv`. That request needs the cloud bearer token and answers 403 without it, so surfacing a file to a browser means proxying it through an authenticated route; putting the token in the page would hand every viewer write access to the books.

### Test server

Kitsas runs a test server at `https://test-api.kitsas.fi` (Swagger at `https://test-api.kitsas.fi/api`; the machine-readable spec is at `/api-json`, since the `/api` page itself is a single-page app). A test account can be created there freely, but data retention is not guaranteed. Set `KITSAS_HUB_URL="https://test-api.kitsas.fi"` to point discovery at it — `.env.example` defaults to the test server. The Kitsas desktop client connects to the same server with `--api https://test-api.kitsas.fi`; on macOS the bundle hides the CLI, so run `/Applications/Kitsas.app/Contents/MacOS/Kitsas --api …` or `open -n -a Kitsas --args --api …`.

The cloud backend the test Hub hands back lives on a _third_ host — `test-app.kitsas.fi/cloud/{cloudid}` — which is why the cloud URL must be read from `clouds[]` and cannot be derived from the Hub host.

Creating a book through `POST /v1/books` allocates the cloud but does **not** provision its database schema: `/init` and `/tositteet` then fail with `relation "k{cloudid}.asetus" does not exist`. Initialize a new book from the desktop client instead.

`GET /api/kitsas/discover` uses the official Hub client to read the available books, accounts, dimensions, and fiscal years. Set the `KITSAS_HUB_*` variables to use it. Its response also carries a `cloud` block — the resolved cloudid, name, URL, and whether `GET /init` on that cloud answered — so a broken cloud configuration is visible without running a sync. The mock connection is covered by `pnpm test:kitsas-mock` and uses no network or real Kitsas data.

Kitsas sync fetches the current budget period through today and the equivalent date range one year earlier. The dashboard compares each mapped account's budget, current-period realization, and same-period-prior-year realization. Expense lines use debit entries; income lines (3000–3999) use credit entries.

## Vercel

Budu is linked to the `pitvaeltajats-projects/budu` Vercel project. Klapi’s Google OAuth client ID and secret were copied to Budu’s production, preview, and development environments. Budu has its own generated `AUTH_SECRET`; Klapi’s database URL and AWS credentials were intentionally not copied.
