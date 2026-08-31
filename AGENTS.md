<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Before you finish

Nothing enforces this — there is no pre-commit hook and no CI — so run it yourself, every time:

```
pnpm format && pnpm lint && pnpm type-check && pnpm test
```

Prettier owns layout (`.prettierrc.json`: single quotes, 120 columns) and ESLint owns correctness; `eslint-config-prettier` keeps them out of each other's way. `pnpm format:check` is the read-only version if you want to see what would change first.

Behaviour worth a test goes in `tests/` as a `node --test` file, and into the `test` script in `package.json` — the budget's section mapping and pace judgement are both covered that way, and neither needs a database to run.

# Landing your work

Finished work belongs on `origin/main`, not left uncommitted in a working tree. Once the checks above pass, commit it and push — from whatever branch or worktree you are on:

```
git add -A && git commit && git push origin HEAD:main
```

`HEAD:main` is the part that matters. `git push origin main` pushes the local `main` ref, which in a worktree or on a feature branch is whatever `main` was when you started — usually not your work. And do not try to merge into `main` first: it is checked out in the primary working tree at `~/pitva/budu`, so git refuses to update it from anywhere else (`branch is currently checked out`). Push straight to the remote branch instead; the primary checkout catches up with `git pull --ff-only` next time someone works there.

Do not leave the tree dirty for someone else to figure out.

Write the commit message the way the log already reads: one imperative sentence saying what changed for the user, no scope prefix, no bullet list. "Flag overspending rows and put BUDU in the header", not "feat(dashboard): add overspend flags".

Pushing to `main` deploys: Vercel builds every push, and `vercel.json` runs the Kitsas sync crons against production. So the checks are not a formality — a red push is a broken deploy.

# Reaching the production database

Production Postgres is **not** a managed service and its URL is not readable from Vercel: `DATABASE_URL` is stored Secret-typed, so `vercel env pull` writes `[SENSITIVE]` where the value should be. It runs in Docker on an AWS Lightsail instance, and the way in is the Lightsail API — not a stored SSH key, and not the connection string.

|                |                                                         |
| -------------- | ------------------------------------------------------- |
| AWS profile    | `AdministratorAccess-306454755163`, region `eu-north-1` |
| Instance       | `pitva-debian-1`, user `admin` (Debian blueprint)       |
| Container      | `budu-postgres`, database `budu`, user `budu`           |
| Published port | **5434**                                                |

Start with `aws lightsail get-instances`; if it answers `Token has expired and refresh failed`, the fix is `aws sso login --profile AdministratorAccess-306454755163`, which is interactive — ask the user to run it rather than trying to work around it.

There is no stored key for this host and `~/.ssh/pitva` is a different machine (a Tailscale desktop). Lightsail mints a temporary one on demand:

```
aws lightsail get-instance-access-details --instance-name pitva-debian-1 --protocol ssh \
  --profile AdministratorAccess-306454755163 --region eu-north-1
```

Write its `privateKey` and `certKey` to files at mode 600 and connect with `ssh -i <key> -o CertificateFile=<cert> admin@<ip>`. **Delete both afterwards** — they are credentials to a production host, and they do not belong in a repo or a scratch directory any longer than the task needs them.

Once on the box, do not go looking for the password. `sudo docker exec budu-postgres psql -U budu -d budu` authenticates locally inside the container, so a query needs no secret at all:

```
sudo docker exec budu-postgres psql -U budu -d budu -c 'select count(*) from "KitsasEntry";'
```

Table names are quoted because Prisma keeps its model casing; unquoted `kitsasentry` will not resolve.

## Rules for touching that database

- **5432 and 5433 on that host are Klapi's**, a different production application. Only 5434 is Budu. Never point a command at the others, and never try credentials against them to find out which is which.
- `KitsasEntry`, `KitsasVoucherState` and `SyncRun` are all derived — a sync rebuilds them from Kitsas. `Budget` and `BudgetLine` are the imported talousarviot and the only rows in the database that cannot be recovered by re-running anything. Do not delete them.
- Deleting a budget's `SyncRun` rows is what puts the dashboard back into its pending state, so it fetches immediately instead of rendering zeroes. Clearing entries without clearing sync runs leaves it confidently showing nothing.
- `KitsasEntry.syncedAt` records which run wrote each row, which is the reliable way to tell one book's data from another's after a configuration change. Prefer it to guessing from dates or descriptions.
- Look before you delete. Count the rows and read a sample first: a table can hold real and stale data at once, and the difference is usually a `WHERE` clause rather than a `TRUNCATE`.
