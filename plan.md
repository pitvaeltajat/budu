# Plan: writing kirjanpito events into Kitsas

Budu reads Kitsas today. This is the plan for making it write, once the association has production Kitsas access.
Nothing here has been built; nothing here has been tried against a real book. Everything marked **verified** was checked
against the production API description at `https://api.kitsas.fi/api-json` and the `kitsas-library@0.1.56` sources on
2026-08-26. Everything marked **open** needs the production book, a look at the Holvi settings, or a decision from the
person who does the kirjanpito.

## The short version

1. **Holvi needs no code.** The association already runs the Kitsas Holvi lisäosa, which does more than we could.
   What it does create is a double-booking hazard, and settling that is the first task in this plan.
2. **Build kululaskut.fi → Kitsas.** That is where the value is, it is the source we control, and nobody else is
   selling it.
3. Post as **drafts, never as booked entries**, with a Kitsas service account whose rights make booking impossible.
4. Idempotency lives in Budu's own database, not in hope.

## 1. Holvi is already connected, and that is the constraint

The association already runs the Kitsas Holvi lisäosa
([kitsas.fi/docs/lisaosat/holvi](https://kitsas.fi/docs/lisaosat/holvi/), 5,00 €/kk). For the range someone fetches, it
creates the tositteet, uploads the receipt images held in Holvi, saves the tiliote, and tiliöi the rows from the Holvi
categories — mapping Holvi accounts and cards to kirjanpitotilit by **IBAN**, and Holvi categories to account numbers
through the `Tilinumero` field under Holvi's `Kirjanpito > Luokat`.

So there is nothing to build for Holvi, and the Holvi API question is closed: it does not matter that Holvi has no
usable API for us, because Kitsas already has the connection and Budu's read sync picks up the result with no new code.

**What it does mean is that the expense account is already occupied.** A kulukorvaus paid from the Holvi account is
_already_ a Holvi transaction, and the addon already books it. If Budu also posts the claim from kululaskut.fi as an
expense, the same euro lands in the books twice. This is the central design constraint of the whole project, and it has
exactly one rule:

> For any one expense, exactly one of the two sources may touch the expense account.

Two ways to satisfy it.

### Option A — the Holvi payment becomes a payment, not an expense (recommended)

- In Holvi, under `Kirjanpito > Luokat`, the category used for kulukorvaus payments gets its `Tilinumero` pointed at a
  **payable account** (ostovelat/siirtovelat, e.g. 2870) instead of an expense account.
- Budu posts each approved claim as `BILLOFCOSTS`: entries on the real expense accounts, and
  `contraEntry: { account: <that same payable>, newBalanceItem: true }`, which opens a tase-erä.
- The Holvi payment then arrives against the payable and closes the erä. The expense is booked on the claim's own date,
  split across the accounts the claim actually itemises; the bank line is just money moving.
- This is what the expense account split is for. Budu's dashboard compares realized spending per talousarvio row, and a
  lump "Kulukorvaukset" transfer tells it nothing — the itemisation only exists in kululaskut.fi.
- Costs: someone sets that one mapping in Holvi and uses the category consistently, and a single Holvi transfer that
  covers several claims has to reconcile against several tase-erät.

### Option B — leave Holvi booking the expense, and do not write claims at all

- Nothing to build. The books are already roughly right at the lump level.
- What is given up: the per-account split, the claim's own date, the claimant as partner, and any link to the receipt.
- Worth stating plainly because it is the honest baseline. If the Holvi category mapping is already fine-grained enough
  that the dashboard's rows come out right, this project is not worth doing.

**Open, and it decides the rest:** how kulukorvaus payments out of Holvi are categorised today, and whether the book has
a payable account to point them at. That is a look in Holvi's `Kirjanpito > Luokat` and in the Kitsas tililuettelo, not
a code question.

### Two operational facts about the addon

- **It is manual.** Someone picks a date range and presses `Tallenna kirjanpitoon`; there is no cron and Budu cannot
  trigger it. So the two sources will not be in step, and the tase-erä in option A may sit open for a while. That is
  fine — it is what a payable is — but it means "the dashboard is missing money" will usually mean "nobody has fetched
  Holvi lately", and that is worth saying on screen rather than making people guess.
- **`Toistaiseksi aineiston hakua ei voi täydentää`** — a fetch cannot be topped up afterwards; corrections are made
  inside Kitsas. So the Holvi-side category mapping wants to be right _before_ the next big fetch, not after.

For reference, Kitsas's own addon for the comparable source is **Finago eTasku**, 1,00 €/kk, which fetches
`kuitit ja matkalaskut` with their images and tiliöinnit and creates one `Tuonti`-type tosite per claim. We are not
using it, but its shape — one import voucher per claim — is the precedent our writer follows.

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

One Kitsas voucher per approved kululasku. Under **option A** above, which is what makes the claim and its Holvi
payment two halves of one story rather than the same expense twice:

```
type:        BILLOFCOSTS   (Kitsas's own type for a kululasku)
date:        the claim's expense date
status:      DRAFT
title:       claimant + short description
entries:     one per claim row → { account (mapped), amount, description, vatCode: FREE, dimensions? }
contraEntry: { account: <payable, e.g. 2870>, newBalanceItem: true }
partner:     { name: claimant }
note:        backlink to the claim in kululaskut.fi
origin:      { source: 'kululaskut.fi', id: <claim id>, url: <claim url> }
```

`contraEntry` also takes an `archiveId`, which is how Kitsas ties a voucher to a bank line's arkistointitunnus. We do
not know what the Holvi addon puts there, so the first version leaves it out and lets the tase-erä be matched in Kitsas
the ordinary way. Worth a look at a Holvi-imported voucher once we are in the book — if the arkistointitunnus is
predictable, the match could be automatic.

If the Holvi side is _not_ remapped to a payable, drop `contraEntry` and use `type: IMPORT`, which is what eTasku does —
but then option B applies and the claims must not carry the expense accounts at all. Do not build the middle case where
both sources book the expense.

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

| Needs                    | To answer                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| A production book        | Which field shows a backlink in the Kitsas UI; whether `origin` survives a round-trip                  |
| A production book        | Whether a drafting-rights-only user can really POST `/v1/vouchers` (rights are documented, not tested) |
| Holvi + the tililuettelo | How kulukorvaus payments are categorised today, and whether a payable account exists — decides A vs B  |
| The kirjanpitäjä         | Sign-off on option A; whether images may stay outside the books                                        |
| kululaskut.fi            | Stable claim ids; whether approval is final                                                            |

Everything else can be developed now against `test-api.kitsas.fi`, which Budu already supports through
`KITSAS_HUB_URL`, and against `MockKitsasBook` for the write calls.

## 4. Order of work

1. **Settle the boundary in Holvi.** Look at how kulukorvaus payments are categorised under `Kirjanpito > Luokat`, and
   point that category at a payable account. No code, but it has to happen before the first claim is posted, or the
   same expense lands in the books twice. If the answer is that the current mapping is already good enough, stop here —
   that is option B and it is a legitimate outcome.
2. kululaskut.fi export endpoint + shared secret.
3. Budu: `PostedVoucher`, the mapping table, the admin mapping UI.
4. Budu: `lib/kitsas-write.ts` against the mock, then against the test book.
5. Staging UI on `/admin`, then one real claim posted as a draft to production, checked by hand in Kitsas — including
   that its tase-erä closes against the Holvi payment when that month is fetched.
6. Backfill, in one batch, watched.
