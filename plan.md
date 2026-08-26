# Plan: writing kirjanpito events into Kitsas

Budu reads Kitsas today. This is the plan for making it write, once the association has production Kitsas access.
Nothing here has been built; nothing here has been tried against a real book. Everything marked **verified** was checked
against the production API description at `https://api.kitsas.fi/api-json` and the `kitsas-library@0.1.56` sources on
2026-08-26. Everything marked **open** needs a real book, a real Holvi account, or a decision from the person who does
the kirjanpito.

## The short version

1. **Do not build a Holvi integration.** Kitsas sells a first-party Holvi lisäosa for 5,00 €/kk that does more than we
   could, including the images and the tiliote. Buy it.
2. **Build kululaskut.fi → Kitsas.** That is where the value is, it is the source we control, and nobody else is
   selling it.
3. Post as **drafts, never as booked entries**, with a Kitsas service account whose rights make booking impossible.
4. Idempotency lives in Budu's own database, not in hope.

## 1. Holvi: buy the lisäosa, do not write the code

Kitsas has an official Holvi addon
([kitsas.fi/docs/lisaosat/holvi](https://kitsas.fi/docs/lisaosat/holvi/)). What it does:

- Fetches `kirjanpitotapahtumat` for a chosen date range, **with the receipt images attached in Holvi** and with the
  tiliöinnit made in Holvi.
- Maps Holvi accounts and cards to kirjanpitotilit by **IBAN**, set per account in Kitsas under
  `Asetukset > Tililuettelo > Muokkaa > Perustiedot`.
- Maps Holvi categories to account numbers from the Holvi end: `Kirjanpito > Luokat`, `Tilinumero` field per category.
- Shows a preview, flags rows it cannot tiliöi automatically, and on `Tallenna kirjanpitoon` creates the tositteet,
  uploads the image files, **and saves the tiliote itself into Kitsas**.
- Costs 5,00 €/kk (+alv) and requires the book to live in the Kitsas cloud, which ours does.

Consequences for this plan:

- **The Holvi API question is closed.** It does not matter that Holvi has no usable API for us — Kitsas already has the
  connection. Trying to reach Holvi from Budu would be a worse copy of something that costs five euros a month.
- **The connection must be made by the Holvi account owner**, not a kirjanpitoassistentti. Someone with the
  association's Holvi credentials has to do the OAuth handshake once, confirming with Holvi's 2FA. It can be done in
  WebKitsas without installing the desktop client, but that person needs their own Kitsas user.
- **It is manual, not scheduled.** Someone picks a date range and presses `Tallenna kirjanpitoon`. There is no cron. If
  we want the books to stay current without anyone remembering, the realistic answer is a monthly reminder, not
  automation — Budu cannot trigger the addon.
- **`Toistaiseksi aineiston hakua ei voi täydentää`** — a fetch cannot be topped up afterwards. Missing liitteet have to
  be fixed inside Kitsas. So the Holvi-side categorisation should be set up properly _before_ the first big import,
  otherwise someone hand-fixes a year of rows.
- Budu's existing read sync picks all of it up unchanged. Holvi money appears on the dashboard with no new Budu code.

The comparable addon for expense claims is **Finago eTasku**, 1,00 €/kk, which fetches `kuitit ja matkalaskut` with
images and tiliöinnit and creates one `Tuonti`-type tosite per claim. We are not using eTasku, but it is worth knowing
that Kitsas's own answer to "expense claims from another system" is one import-type voucher per claim — that is the
shape our kululaskut.fi writer should imitate.

## 2. kululaskut.fi → Kitsas: the actual project

### What Kitsas offers (verified)

Three write endpoints exist in **production**, all bearer-authenticated, all already wrapped by `kitsas-library`, which
Budu depends on for `lib/kitsas-hub.ts`:

| Endpoint                | Library call                                          | Use                              |
| ----------------------- | ----------------------------------------------------- | -------------------------------- |
| `POST /v1/vouchers`     | `book.saveVoucher(dto, attachments)`                  | this project                     |
| `POST /v1/transactions` | `book.saveTransactions(iban, start, end, entries, …)` | not needed — Holvi addon does it |
| `POST /v1/invoices`     | `book.saveInvoice(dto, attachments)`                  | not needed                       |

`CreateVoucherDto` requires `type`, `date`, `status`, `entries`, and accepts `title`, `partner`, `contraEntry`, `note`,
`attention`, and a free-form `origin` object described as "Origin of the voucher". Each entry requires `account`,
`amount` and **`vatCode`** — the spec marks `vatCode` required even though the TypeScript type has it optional, so send
`FREE` for a non-ALV-liable association rather than omitting it.

`VoucherType` is `INCOME | EXPENSE | BILLOFCOSTS | IMPORT | OTHER`. `VoucherStatus` is
`RECEIVED | CHECKED | APPROVED | DRAFT | BOOKED`.

### The safety design

The Kitsas rights model has **separate rights for drafting and saving**: `Tl` (Draft) and `Tt` (Save), plus circulation
rights `Kl` (CircleAdd), `Kt` (CircleCheck), `Kh` (CircleAccept). So:

- Create a **dedicated Kitsas user for Budu**, invited to the book with drafting rights and no saving right.
- Budu then _physically cannot_ write to the ledger. The guarantee is enforced by Kitsas's permission system, not by a
  comment in our source. Everything Budu posts waits for a human in Kitsas.
- Post with `status: DRAFT` to start with. `RECEIVED` puts claims into Kitsas's own kierto (approval circulation) if we
  later decide claims should be approved inside Kitsas rather than in kululaskut.fi. `BOOKED` is not on the table.
- **The service account must not have two-factor authentication.** `POST /v1/login` answers 401 with "two factor
  authorization is required" and there is no machine-credential flow in the API.
- Keep it as a **second credential**, separate from the existing `KITSAS_HUB_USERNAME`/`KITSAS_HUB_PASSWORD` used for
  reading. A leak of the sync credential must not grant writes.

### Voucher shape

One Kitsas voucher per approved kululasku, following the eTasku precedent:

```
type:   IMPORT            (what Kitsas itself uses for "copied from another system")
date:   claim's approval or expense date
status: DRAFT
title:  claimant + short description
entries: one per claim row → { account (mapped), amount, description, vatCode: FREE, dimensions? }
partner: { name: claimant }
note:   backlink to the claim in kululaskut.fi
origin: { source: 'kululaskut.fi', id: <claim id>, url: <claim url> }
```

`BILLOFCOSTS` with `contraEntry: { account: <ostovelat>, newBalanceItem: true }` is the alternative: it opens a
tase-erä so the unpaid claim shows as a payable and closes when the Holvi payment arrives. That is more correct
bookkeeping and more moving parts. **Open:** decide with the kirjanpitäjä. Start with `IMPORT`, since a wrong draft is
cheap and an orphaned tase-erä is not.

### Images stay in kululaskut.fi

Decided: Budu does **not** upload receipt images. `saveVoucher` takes multipart attachments and we could, but the images
already live in kululaskut.fi and duplicating them buys little.

Instead, put a backlink to the claim into the voucher, and store the returned Kitsas voucher id back in kululaskut.fi so
the link goes both ways.

Two things to settle before this is final:

- **Open:** which field actually renders as a clickable link in Kitsas — `note`, the entry `description`, or nothing at
  all. `origin` is documented as an arbitrary object and is probably invisible in the UI, which makes it good for
  machine-readable provenance and useless as a backlink. Needs a real book to test. Write the backlink into `note`
  _and_ `origin` until we know.
- **Flag, not a blocker:** both Kitsas addons for comparable sources (Holvi, eTasku) _do_ carry the images into the
  books, and kirjanpitolaki expects tositteet to be retained with the accounts for six years. A URL into a third-party
  service is not the same guarantee as a file in the book. If the kirjanpitäjä or tilintarkastaja wants the images in
  Kitsas, switching is a small change — `saveVoucher` already takes the attachments — but kululaskut.fi would then need
  to serve the bytes to Budu, not just a link. Ask before the first production run.

### Data out of kululaskut.fi

CSV export via a service account works, but since we control kululaskut.fi, a small authenticated JSON endpoint is
better and roughly an afternoon's work:

```
GET /api/export/approved?since=<iso8601>
Authorization: Bearer <shared secret>
→ [{ id, approvedAt, expenseDate, claimant, category, rows:[{ description, cents, category }], url }]
```

Why not CSV: stable ids (the idempotency key depends on them), cents as integers instead of locale-formatted decimals,
no re-export of overlapping date ranges, and a `since` cursor. CSV stays the fallback if kululaskut.fi is not to be
touched.

**Open:** does kululaskut.fi have a stable, immutable per-claim id, and a notion of "approved" that never un-approves?
If a claim can be edited after approval, we need an edit policy — Kitsas has no update endpoint, only create, so a
changed claim means a correcting voucher or a manual fix. Simplest first version: **export only approved claims, and
treat approval as final.**

### Changes inside Budu

- **`lib/kitsas-write.ts`**, new, on the Hub API via `kitsas-library`. Keep `lib/kitsas.ts` literally GET-only so the
  "Kitsas safety contract" section of `README.md` stays true; rewrite that section to describe two credentials and two
  directions rather than deleting it. The read-only claim is load-bearing documentation and it is about to become false
  if we are careless.
- **`lib/kululaskut.ts`**, the client for the export endpoint above.
- **New Prisma model** for idempotency:

  ```prisma
  model PostedVoucher {
    source          String   // 'kululaskut.fi'
    sourceId        String   // claim id
    kitsasVoucherId String?
    payloadHash     String
    status          String   // PROPOSED | POSTING | POSTED | FAILED
    postedAt        DateTime?
    @@id([source, sourceId])
  }
  ```

  Written as `POSTING` _before_ the POST, so a request that times out after Kitsas committed does not double-book on
  retry. Reconciled afterwards against the read sync, which will see the new voucher on its next run.

- **Account mapping**, kululaskut.fi category → Kitsas account number. Both halves already exist in Budu:
  `discoverKitsasHub` reads the account catalogue, and `BudgetLine.kitsasAccount` already ties accounts to budget rows.
  Admin-editable on `/admin`, next to the existing meno/tulo reclassification.
- **A staging step on `/admin`**: import → proposed vouchers with the mapping applied → an admin approves → post. Not
  optional. An unattended cron writing into a real association's books on the strength of a parser is how you get a mess
  that someone unwinds by hand.
- **Tests**: `MockKitsasBook` implements `saveVoucher`, so the write path is testable with no network and no
  credentials, the same way `tests/kitsas-library.mock.test.mjs` already covers the read connection. Mapping and voucher
  construction are pure functions and belong in `tests/` like `budget-sections` and `realized` do.

### The loop closes on itself

Post a draft, and the existing `/api/cron/kitsas` sync sees it on its next run and moves the realized figures on the
dashboard. The write path is verified by the read path we already trust. That is also the integration test: post one
claim to the test book, wait for a sync, check the number moved.

## 3. What is blocked on access

| Needs                   | To answer                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| A production book       | Which field shows a backlink in the Kitsas UI; whether `origin` survives a round-trip                  |
| A production book       | Whether a drafting-rights-only user can really POST `/v1/vouchers` (rights are documented, not tested) |
| The Holvi account owner | The one-time Holvi ↔ Kitsas OAuth connection                                                           |
| The kirjanpitäjä        | `IMPORT` vs `BILLOFCOSTS`; whether images may stay outside the books                                   |
| kululaskut.fi           | Stable claim ids; whether approval is final                                                            |

Everything else can be developed now against `test-api.kitsas.fi`, which Budu already supports through
`KITSAS_HUB_URL`, and against `MockKitsasBook` for the write calls.

## 4. Order of work

1. Holvi lisäosa purchased and connected by the account owner; Holvi categories given account numbers; kirjanpitotilit
   given IBANs. No Budu code. **Do this first — it is the cheapest realized value in the whole plan.**
2. kululaskut.fi export endpoint + shared secret.
3. Budu: `PostedVoucher`, the mapping table, the admin mapping UI.
4. Budu: `lib/kitsas-write.ts` against the mock, then against the test book.
5. Staging UI on `/admin`, then one real claim posted as a draft to production, checked by hand in Kitsas.
6. Backfill the year, in one batch, watched.
