/**
 * Seeds the configured Kitsas TEST book with a realistic association year.
 *
 * This is a development utility, not part of the app: it uses the documented
 * Hub upload (POST /v1/vouchers) so Budu's own read-only client stays read-only.
 * It refuses to run against api.kitsas.fi.
 *
 *   node --env-file=.env.local scripts/seed-kitsas-test.mjs
 */
const hub = (process.env.KITSAS_HUB_URL || '').replace(/\/$/, '');
if (!hub.includes('test-api.kitsas.fi')) {
  console.error(`Refusing to seed: KITSAS_HUB_URL is "${hub}", not the test server.`);
  process.exit(1);
}

/** Deterministic PRNG so repeated runs produce a comparable book. */
let seed = 20260824;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const jitter = (base, pct) => Math.round(base * (1 + (rnd() * 2 - 1) * pct) * 100) / 100;
const pick = (list) => list[Math.floor(rnd() * list.length)];

const MONTHLY = [
  { account: '4401', title: 'Toimitilavuokra', base: 850, pct: 0 },
  { account: '4411', title: 'Sähkölasku', base: 115, pct: 0.35 },
  { account: '4911', title: 'Puhelinlasku', base: 45, pct: 0.12 },
  { account: '4913', title: 'Verkkoyhteys', base: 39, pct: 0 },
  { account: '4921', title: 'Pankin palvelumaksut', base: 12, pct: 0.2 },
];
const QUARTERLY = [{ account: '4985', title: 'Taloushallinnon palvelut', base: 250, pct: 0.1 }];
const ANNUAL = [
  { account: '4986', title: 'Tilintarkastus', base: 600, pct: 0.05, month: 3 },
  { account: '4931', title: 'Vastuuvakuutus', base: 320, pct: 0.05, month: 1 },
  { account: '4451', title: 'Kiinteistövero', base: 410, pct: 0.03, month: 9 },
];
const OCCASIONAL_EXPENSE = [
  { account: '4000', titles: ['Leirin tarvikkeet', 'Askartelutarvikkeet', 'Keittiötarvikkeet'], base: 240, pct: 0.6 },
  { account: '4100', titles: ['Ohjaajapalkkio', 'Siivouspalvelu', 'Kuljetuspalvelu'], base: 380, pct: 0.5 },
  { account: '4580', titles: ['Lehti-ilmoitus', 'Esitteiden painatus'], base: 180, pct: 0.4 },
  { account: '4701', titles: ['Junaliput, kevätkokous', 'Bussiliput, retki'], base: 145, pct: 0.5 },
  { account: '4741', titles: ['Kilometrikorvaukset'], base: 96, pct: 0.6 },
  { account: '4941', titles: ['Toimistotarvikkeet'], base: 68, pct: 0.5 },
  { account: '4951', titles: ['Hallituksen kokoustarjoilut'], base: 54, pct: 0.4 },
  { account: '4800', titles: ['Stipendi', 'Avustus jäsenyhdistykselle'], base: 500, pct: 0.3 },
];
const INCOME = [
  { account: '3000', titles: ['Kevätleirin osallistumismaksut', 'Syysleirin osallistumismaksut', 'Kurssimaksut'], base: 1450, pct: 0.4 },
  { account: '3700', titles: ['Lahjoitus, yksityinen', 'Keräystuotto'], base: 620, pct: 0.7 },
  { account: '3800', titles: ['Kunnan toiminta-avustus', 'Kohdeavustus'], base: 3200, pct: 0.25 },
  { account: '3900', titles: ['Kirpputoritulot', 'Kahvion myynti'], base: 310, pct: 0.5 },
];

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const vouchers = [];
const add = (type, date, title, account, amount, description) =>
  vouchers.push({ type, date, title, status: 'BOOKED', entries: [{ account, description: description || title, amount: amount.toFixed(2) }], contraEntry: { account: '1910' } });

for (const year of [2025, 2026]) {
  const lastMonth = year === 2026 ? 8 : 12;
  for (let m = 1; m <= lastMonth; m++) {
    for (const r of MONTHLY) add('EXPENSE', iso(year, m, 5), r.title, r.account, jitter(r.base, r.pct), `${r.title} ${m}/${year}`);
    if (m % 3 === 1) for (const q of QUARTERLY) add('EXPENSE', iso(year, m, 12), q.title, q.account, jitter(q.base, q.pct));
    for (const a of ANNUAL) if (a.month === m) add('EXPENSE', iso(year, m, 20), a.title, a.account, jitter(a.base, a.pct));
    const extras = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < extras; i++) {
      const e = pick(OCCASIONAL_EXPENSE);
      add('EXPENSE', iso(year, m, 6 + Math.floor(rnd() * 20)), pick(e.titles), e.account, jitter(e.base, e.pct));
    }
    if (rnd() > 0.35) {
      const inc = pick(INCOME);
      add('INCOME', iso(year, m, 3 + Math.floor(rnd() * 24)), pick(inc.titles), inc.account, jitter(inc.base, inc.pct));
    }
  }
}

const post = async (token, voucher) => {
  const fd = new FormData();
  fd.append('voucher', JSON.stringify(voucher));
  const r = await fetch(`${hub}/v1/vouchers`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!r.ok) throw new Error(`${voucher.date} ${voucher.title}: ${r.status} ${(await r.text()).slice(0, 160)}`);
};

const login = await (await fetch(`${hub}/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.KITSAS_HUB_USERNAME, password: process.env.KITSAS_HUB_PASSWORD }) })).json();
const books = await (await fetch(`${hub}/v1/books`, { headers: { Authorization: `Bearer ${login.access_token}` } })).json();
if (!books.length) throw new Error('No books on this account.');
const bookToken = (await (await fetch(`${hub}/v1/login/${books[0].id}`, { headers: { Authorization: `Bearer ${login.access_token}` } })).json()).access_token;
console.log(`Seeding ${vouchers.length} vouchers into "${books[0].name}"…`);

/**
 * A voucher is only postable inside an *opened* fiscal year. `tilikaudet` lists
 * unopened years too and offers no reliable flag distinguishing them, so rather
 * than guess, post and let the server rule: a year that is not open rejects
 * writes with a bare 500. Opening a past fiscal year is a GUI action.
 */
const cloudLogin = await (await fetch(`${hub}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.KITSAS_HUB_USERNAME, password: process.env.KITSAS_HUB_PASSWORD, application: 'Budu' }) })).json();
const cloud = cloudLogin.clouds[0];
const cloudHeaders = { Authorization: `Bearer ${cloud.token}`, Accept: 'application/json' };
const init = await (await fetch(`${cloud.url}/init`, { headers: cloudHeaders })).json();
const periods = init.tilikaudet || [];
const inFiscalYear = (date) => periods.some((t) => date >= t.alkaa && date <= t.loppuu);
const years = [...new Set(vouchers.map((v) => v.date.slice(0, 4)))];
const existing = new Set();
for (const year of years) {
  const list = await (await fetch(`${cloud.url}/tositteet?alkupvm=${year}-01-01&loppupvm=${year}-12-31`, { headers: cloudHeaders })).json();
  for (const item of list) existing.add(`${item.pvm}|${item.otsikko}`);
}

const outside = vouchers.filter((v) => !inFiscalYear(v.date)).length;
const pending = vouchers.filter((v) => inFiscalYear(v.date) && !existing.has(`${v.date}|${v.title}`));
if (outside) console.log(`Skipping ${outside} voucher(s) outside any fiscal year.`);
console.log(`${existing.size} voucher(s) already present; posting ${pending.length}.`);

// Sequential: voucher running numbers are assigned server-side and concurrent
// posts to the same series are not worth the risk of gaps.
let done = 0, failed = 0;
for (const v of pending) {
  try { await post(bookToken, v); done++; }
  catch (e) { failed++; console.error(`${String(e.message)}${String(e.message).includes(' 500') ? '  (is that fiscal year opened?)' : ''}`); }
  if (done && done % 25 === 0) console.log(`  ${done}/${pending.length}`);
}
console.log(`Done: ${done} created, ${failed} failed.`);
