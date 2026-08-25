import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';

// `prettier` goes last: it switches off the rules that would argue with the
// formatter, so layout is Prettier's business and correctness is ESLint's.
export default defineConfig([...nextVitals, prettier, globalIgnores(['.next/**', 'node_modules/**'])]);
