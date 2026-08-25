import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';

// `prettier` goes last: it switches off the rules that would argue with the
// formatter, so layout is Prettier's business and correctness is ESLint's.
/**
 * The ignores are deliberately unanchored. The primary checkout keeps agent
 * worktrees under `.claude/worktrees/`, each a full copy of this repository
 * with its own `app/`, `.next/` and build output, so a root-anchored
 * `.next/**` leaves every one of those copies to be linted — hundreds of
 * problems in code that is not the tree you are working on.
 */
const IGNORED = ['**/.next/**', '**/node_modules/**', '.claude/**', '.vercel/**', '.pnpm-store/**'];

export default defineConfig([...nextVitals, prettier, globalIgnores(IGNORED)]);
