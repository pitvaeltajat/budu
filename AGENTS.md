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

Finished work belongs on `origin/main`, not left uncommitted in a working tree. Once the checks above pass, commit it and push:

```
git add -A && git commit && git push origin main
```

Working on a branch or in a worktree is fine — merge it into `main` and push that. Do not leave the tree dirty for someone else to figure out.

Write the commit message the way the log already reads: one imperative sentence saying what changed for the user, no scope prefix, no bullet list. "Flag overspending rows and put BUDU in the header", not "feat(dashboard): add overspend flags".

Pushing to `main` deploys: Vercel builds every push, and `vercel.json` runs the Kitsas sync crons against production. So the checks are not a formality — a red push is a broken deploy.
