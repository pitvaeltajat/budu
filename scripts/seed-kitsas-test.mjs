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
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
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
  {
    account: '3000',
    titles: ['Kevätleirin osallistumismaksut', 'Syysleirin osallistumismaksut', 'Kurssimaksut'],
    base: 1450,
    pct: 0.4,
  },
  { account: '3700', titles: ['Lahjoitus, yksityinen', 'Keräystuotto'], base: 620, pct: 0.7 },
  { account: '3800', titles: ['Kunnan toiminta-avustus', 'Kohdeavustus'], base: 3200, pct: 0.25 },
  { account: '3900', titles: ['Kirpputoritulot', 'Kahvion myynti'], base: 310, pct: 0.5 },
];

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const vouchers = [];
const add = (type, date, title, account, amount, description) =>
  vouchers.push({
    type,
    date,
    title,
    status: 'BOOKED',
    entries: [{ account, description: description || title, amount: amount.toFixed(2) }],
    contraEntry: { account: '1910' },
  });

for (const year of [2025, 2026]) {
  const lastMonth = year === 2026 ? 8 : 12;
  for (let m = 1; m <= lastMonth; m++) {
    for (const r of MONTHLY)
      add('EXPENSE', iso(year, m, 5), r.title, r.account, jitter(r.base, r.pct), `${r.title} ${m}/${year}`);
    if (m % 3 === 1)
      for (const q of QUARTERLY) add('EXPENSE', iso(year, m, 12), q.title, q.account, jitter(q.base, q.pct));
    for (const a of ANNUAL)
      if (a.month === m) add('EXPENSE', iso(year, m, 20), a.title, a.account, jitter(a.base, a.pct));
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

/**
 * Second pass: the same association's year written account by account, on the
 * calendar it actually happens on. The block above is left exactly as it was so
 * its vouchers keep matching what is already in the book; this one widens the
 * book from the ~20 accounts that pass covers to most of the ones a lippukunta
 * with a rented kolo, a kammi and a summer camp ever touches.
 *
 * Every account here was read out of the book's own tilikartta — the test book
 * carries Kitsas's stock chart, where varainhankinta is 73xx/74xx and poistot
 * are 60xx, so these are not the numbers in PitVa's own Talousarvio.
 */
let programmeSeed = 20260825;
const prnd = () => (programmeSeed = (programmeSeed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** Invoices vary; prices also drift a few percent between the two years. */
const vary = (base, spread, year) =>
  Math.round(base * (year === 2026 ? 1.03 : 1) * (1 + (prnd() * 2 - 1) * spread) * 100) / 100;

/** Bills that arrive on a rhythm rather than on an occasion. */
const RECURRING = [
  { account: '4413', title: 'Kolon lämmitys', base: 240, spread: 0.3, day: 8, months: [1, 2, 3, 4, 10, 11, 12] },
  {
    account: '4431',
    title: 'Kolon siivous',
    base: 95,
    spread: 0.05,
    day: 28,
    months: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12],
  },
  { account: '4415', title: 'Vesi ja jätevesi', base: 68, spread: 0.15, day: 15, months: [1, 4, 7, 10] },
  { account: '4433', title: 'Jätehuolto', base: 76, spread: 0.1, day: 15, months: [1, 4, 7, 10] },
  { account: '4551', title: 'Pakettiauton polttoaine', base: 72, spread: 0.35, day: 22, months: [2, 4, 6, 8, 9, 11] },
  { account: '4491', title: 'Kolon pientarvikkeet', base: 58, spread: 0.5, day: 19, months: [3, 6, 9, 11] },
  { account: '4991', title: 'Muut hallintokulut', base: 52, spread: 0.4, day: 26, months: [2, 5, 9, 12] },
  { account: '4999', title: 'Muut toiminnan kulut', base: 110, spread: 0.5, day: 24, months: [3, 8, 11] },
];

/**
 * The troop's year. `kind` defaults to EXPENSE; `only` pins an entry to the
 * year it actually happened in, which is what makes the two years comparable
 * without being identical.
 */
const CALENDAR = [
  // Talvi: laskutuskausi, vakuutukset ja piirin jäsenmaksu.
  {
    month: 1,
    day: 12,
    account: '7310',
    title: 'Jäsenmaksut, ensimmäinen erä',
    base: 3800,
    spread: 0.06,
    kind: 'INCOME',
  },
  { month: 1, day: 15, account: '4441', title: 'Kiinteistövakuutus', base: 380, spread: 0.04 },
  { month: 1, day: 15, account: '4554', title: 'Pakettiauton vakuutus', base: 420, spread: 0.04 },
  { month: 1, day: 16, account: '4631', title: 'Kaluston vakuutus', base: 155, spread: 0.05 },
  { month: 1, day: 16, account: '4933', title: 'Kammin esinevakuutus', base: 240, spread: 0.05 },
  { month: 1, day: 17, account: '4935', title: 'Tapaturmavakuutus, johtajat', base: 95, spread: 0.05 },
  { month: 1, day: 23, account: '4915', title: 'Jäsenkirjeen postitus', base: 85, spread: 0.2 },
  { month: 2, day: 9, account: '7310', title: 'Jäsenmaksut, toinen erä', base: 2600, spread: 0.08, kind: 'INCOME' },
  { month: 2, day: 14, account: '4310', title: 'Piirin jäsenmaksu', base: 1980, spread: 0.03 },
  { month: 2, day: 18, account: '4461', title: 'Kolon murtohälytys', base: 260, spread: 0.05 },
  { month: 2, day: 21, account: '4701', title: 'Junaliput, talvipäivät', base: 340, spread: 0.25 },
  { month: 2, day: 22, account: '4791', title: 'Majoitus, talvipäivät', base: 420, spread: 0.2 },
  { month: 3, day: 6, account: '7310', title: 'Jäsenmaksut, kolmas erä', base: 880, spread: 0.2, kind: 'INCOME' },
  { month: 3, day: 11, account: '4200', title: 'Kammin maanvuokra', base: 600, spread: 0.02 },
  { month: 3, day: 17, account: '4553', title: 'Pakettiauton ajoneuvovero', base: 145, spread: 0.03 },
  { month: 3, day: 24, account: '4761', title: 'Ateriakorvaukset, johtajakoulutus', base: 95, spread: 0.3 },
  { month: 3, day: 29, account: '4951', title: 'Kevätkokouksen tarjoilut', base: 130, spread: 0.25 },
  // Kevät: avustukset ratkeavat, kammi laitetaan kesäkuntoon.
  { month: 3, day: 20, account: '3800', title: 'Piirin projektiavustus', base: 1200, spread: 0.15, kind: 'INCOME' },
  { month: 4, day: 3, account: '3800', title: 'Kunnan toiminta-avustus', base: 4800, spread: 0.08, kind: 'INCOME' },
  { month: 4, day: 8, account: '4552', title: 'Pakettiauton määräaikaishuolto', base: 320, spread: 0.3 },
  { month: 4, day: 14, account: '4971', title: 'Yhdistysrekisterin muutosilmoitus', base: 60, spread: 0.02 },
  {
    month: 4,
    day: 22,
    account: '3000',
    title: 'Kevätretken osallistumismaksut',
    base: 860,
    spread: 0.2,
    kind: 'INCOME',
  },
  { month: 5, day: 7, account: '8800', title: 'Kunnan yleisavustus', base: 2500, spread: 0.12, kind: 'INCOME' },
  {
    month: 5,
    day: 13,
    account: '4421',
    title: 'Kammin kattohuopa ja tarvikkeet',
    base: 1450,
    spread: 0.35,
    only: 2025,
  },
  { month: 5, day: 13, account: '4421', title: 'Kammin laiturin korjaus', base: 780, spread: 0.3, only: 2026 },
  { month: 5, day: 17, account: '4423', title: 'Talkoopäivän tarvikkeet', base: 190, spread: 0.3 },
  {
    month: 5,
    day: 26,
    account: '7390',
    title: 'Kammin vuokraus toiselle lippukunnalle',
    base: 320,
    spread: 0.4,
    kind: 'INCOME',
  },
  // Kesä: leiri on vuoden suurin yksittäinen tapahtuma molempiin suuntiin.
  { month: 6, day: 3, account: '4731', title: 'Leirin matkavakuutus', base: 210, spread: 0.1 },
  { month: 6, day: 9, account: '4601', title: 'Uudet ryhmäteltat', base: 1850, spread: 0.15, only: 2025 },
  { month: 6, day: 9, account: '4601', title: 'Retkikeittimet ja kirveet', base: 640, spread: 0.2, only: 2026 },
  { month: 6, day: 11, account: '4611', title: 'Leirikaluston vuokra', base: 340, spread: 0.2 },
  { month: 6, day: 12, account: '4550', title: 'Pakettiauton vuokra, leirikuljetus', base: 480, spread: 0.15 },
  {
    month: 6,
    day: 5,
    account: '3700',
    title: 'Yksityislahjoitus leirivarustukseen',
    base: 600,
    spread: 0.4,
    kind: 'INCOME',
  },
  {
    month: 6,
    day: 16,
    account: '3000',
    title: 'Kesäleirin osallistumismaksut',
    base: 5200,
    spread: 0.12,
    kind: 'INCOME',
  },
  { month: 6, day: 18, account: '4000', title: 'Leirin ruokaostot', base: 2350, spread: 0.18 },
  { month: 6, day: 19, account: '4000', title: 'Leirin polttopuut ja kaasu', base: 285, spread: 0.25 },
  { month: 6, day: 27, account: '9050', title: 'Korkotuotot, käyttötili', base: 18, spread: 0.4, kind: 'INCOME' },
  { month: 7, day: 4, account: '5003', title: 'Leirin kokin palkkio', base: 900, spread: 0.05 },
  { month: 7, day: 4, account: '5100', title: 'Eläkevakuutusmaksu, leirin kokki', base: 160, spread: 0.05 },
  { month: 7, day: 4, account: '5120', title: 'Sairausvakuutusmaksu, leirin kokki', base: 13, spread: 0.05 },
  { month: 7, day: 4, account: '5122', title: 'Työttömyysvakuutusmaksu, leirin kokki', base: 6, spread: 0.05 },
  { month: 7, day: 8, account: '4751', title: 'Päivärahat, leirinjohto', base: 260, spread: 0.15 },
  { month: 7, day: 21, account: '4711', title: 'Taksi, sairastapaus leirillä', base: 48, spread: 0.3 },
  // Syksy: kausi alkaa, kammi talvehtii, kalenterikauppa käynnistyy.
  { month: 8, day: 13, account: '4581', title: 'Koulujen alkajaistapahtuman ständi', base: 260, spread: 0.15 },
  { month: 8, day: 19, account: '4421', title: 'Kolon oven lukkojen sarjoitus', base: 620, spread: 0.25, only: 2025 },
  { month: 8, day: 21, account: '3900', title: 'Kirpputoripöydän tuotto', base: 240, spread: 0.4, kind: 'INCOME' },
  {
    month: 9,
    day: 3,
    account: '7310',
    title: 'Jäsenmaksut, syksyn uudet jäsenet',
    base: 700,
    spread: 0.25,
    kind: 'INCOME',
  },
  { month: 9, day: 9, account: '4423', title: 'Kammin polttopuut talveksi', base: 240, spread: 0.2 },
  {
    month: 9,
    day: 15,
    account: '3000',
    title: 'Syysretken osallistumismaksut',
    base: 780,
    spread: 0.2,
    kind: 'INCOME',
  },
  { month: 9, day: 18, account: '4589', title: 'Some-mainonta, jäsenhankinta', base: 120, spread: 0.3 },
  { month: 9, day: 25, account: '4989', title: 'Jäsenrekisterin vuosimaksu', base: 180, spread: 0.05 },
  {
    month: 10,
    day: 2,
    account: '3800',
    title: 'Säätiön kohdeavustus kammin korjaukseen',
    base: 3500,
    spread: 0.1,
    kind: 'INCOME',
    only: 2025,
  },
  { month: 10, day: 7, account: '7400', title: 'Adventtikalenterien ostoerä', base: 1650, spread: 0.1 },
  { month: 10, day: 14, account: '4621', title: 'Perämoottorin huolto', base: 210, spread: 0.3 },
  { month: 10, day: 28, account: '4791', title: 'Johtajiston suunnitteluviikonloppu', base: 380, spread: 0.2 },
  { month: 11, day: 11, account: '7300', title: 'Adventtikalenterimyynti', base: 3100, spread: 0.12, kind: 'INCOME' },
  { month: 11, day: 12, account: '7490', title: 'Kalenterien rahti ja tilitys', base: 140, spread: 0.2 },
  { month: 11, day: 18, account: '4915', title: 'Kalenterien postitus tilaajille', base: 120, spread: 0.25 },
  {
    month: 11,
    day: 24,
    account: '4987',
    title: 'Lakineuvonta, kammin vuokrasopimus',
    base: 450,
    spread: 0.1,
    only: 2025,
  },
  {
    month: 12,
    day: 2,
    account: '7300',
    title: 'Adventtikalenterimyynti, loppuerä',
    base: 1450,
    spread: 0.2,
    kind: 'INCOME',
  },
  { month: 12, day: 8, account: '3700', title: 'Joulukeräyksen tuotto', base: 900, spread: 0.3, kind: 'INCOME' },
  { month: 12, day: 9, account: '4590', title: 'Johtajiston kiitosillallinen', base: 180, spread: 0.2 },
  { month: 12, day: 16, account: '4000', title: 'Joulujuhlan tarjoilut ja pikkulahjat', base: 310, spread: 0.25 },
  { month: 12, day: 29, account: '9050', title: 'Korkotuotot, määräaikaistili', base: 42, spread: 0.3, kind: 'INCOME' },
  { month: 12, day: 30, account: '9150', title: 'Kammin remonttilainan korko', base: 65, spread: 0.1 },
  { month: 12, day: 30, account: '9190', title: 'Lainan hoitokulut', base: 30, spread: 0.05 },
  { month: 12, day: 31, account: '6002', title: 'Poistot koneista ja kalustosta', base: 1250, spread: 0.02 },
];

/** Nothing is booked into the future; 2026 is a year in progress. */
const today = new Date().toISOString().slice(0, 10);
for (const year of [2025, 2026]) {
  for (const entry of CALENDAR) {
    if (entry.only && entry.only !== year) continue;
    const date = iso(year, entry.month, entry.day);
    if (date > today) continue;
    add(entry.kind || 'EXPENSE', date, entry.title, entry.account, vary(entry.base, entry.spread, year));
  }
  for (const r of RECURRING) {
    for (const month of r.months) {
      const date = iso(year, month, r.day);
      if (date > today) continue;
      add('EXPENSE', date, `${r.title} ${month}/${year}`, r.account, vary(r.base, r.spread, year));
    }
  }
}

/** `--dry-run` prints what would be posted, without touching the network at all. */
if (process.argv.includes('--dry-run')) {
  for (const year of ['2025', '2026']) {
    const mine = vouchers.filter((v) => v.date.startsWith(year));
    const income = mine.filter((v) => v.type === 'INCOME').reduce((sum, v) => sum + Number(v.entries[0].amount), 0);
    const expense = mine.filter((v) => v.type !== 'INCOME').reduce((sum, v) => sum + Number(v.entries[0].amount), 0);
    const accounts = [...new Set(mine.map((v) => v.entries[0].account))].sort();
    console.log(
      `${year}: ${mine.length} vouchers, ${accounts.length} accounts, tuloja ${income.toFixed(2)} €, kuluja ${expense.toFixed(2)} €`,
    );
    console.log(`  ${accounts.join(' ')}`);
  }
  process.exit(0);
}

const post = async (token, voucher) => {
  const fd = new FormData();
  fd.append('voucher', JSON.stringify(voucher));
  const r = await fetch(`${hub}/v1/vouchers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`${voucher.date} ${voucher.title}: ${r.status} ${(await r.text()).slice(0, 160)}`);
};

const login = await (
  await fetch(`${hub}/v1/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.KITSAS_HUB_USERNAME, password: process.env.KITSAS_HUB_PASSWORD }),
  })
).json();
const books = await (
  await fetch(`${hub}/v1/books`, { headers: { Authorization: `Bearer ${login.access_token}` } })
).json();
if (!books.length) throw new Error('No books on this account.');
const bookToken = (
  await (
    await fetch(`${hub}/v1/login/${books[0].id}`, { headers: { Authorization: `Bearer ${login.access_token}` } })
  ).json()
).access_token;
console.log(`Seeding ${vouchers.length} vouchers into "${books[0].name}"…`);

/**
 * A voucher is only postable inside an *opened* fiscal year. `tilikaudet` lists
 * unopened years too and offers no reliable flag distinguishing them, so rather
 * than guess, post and let the server rule: a year that is not open rejects
 * writes with a bare 500. Opening a past fiscal year is a GUI action.
 */
const cloudLogin = await (
  await fetch(`${hub}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.KITSAS_HUB_USERNAME,
      password: process.env.KITSAS_HUB_PASSWORD,
      application: 'Budu',
    }),
  })
).json();
const cloud = cloudLogin.clouds[0];
const cloudHeaders = { Authorization: `Bearer ${cloud.token}`, Accept: 'application/json' };
const init = await (await fetch(`${cloud.url}/init`, { headers: cloudHeaders })).json();
const periods = init.tilikaudet || [];
const inFiscalYear = (date) => periods.some((t) => date >= t.alkaa && date <= t.loppuu);
const years = [...new Set(vouchers.map((v) => v.date.slice(0, 4)))];
const existing = new Set();
for (const year of years) {
  const list = await (
    await fetch(`${cloud.url}/tositteet?alkupvm=${year}-01-01&loppupvm=${year}-12-31`, { headers: cloudHeaders })
  ).json();
  for (const item of list) existing.add(`${item.pvm}|${item.otsikko}`);
}

const outside = vouchers.filter((v) => !inFiscalYear(v.date)).length;
const pending = vouchers.filter((v) => inFiscalYear(v.date) && !existing.has(`${v.date}|${v.title}`));
if (outside) console.log(`Skipping ${outside} voucher(s) outside any fiscal year.`);
console.log(`${existing.size} voucher(s) already present; posting ${pending.length}.`);

// Sequential: voucher running numbers are assigned server-side and concurrent
// posts to the same series are not worth the risk of gaps.
let done = 0,
  failed = 0;
for (const v of pending) {
  try {
    await post(bookToken, v);
    done++;
  } catch (e) {
    failed++;
    console.error(`${String(e.message)}${String(e.message).includes(' 500') ? '  (is that fiscal year opened?)' : ''}`);
  }
  if (done && done % 25 === 0) console.log(`  ${done}/${pending.length}`);
}
console.log(`Done: ${done} created, ${failed} failed.`);
