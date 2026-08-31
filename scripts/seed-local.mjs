/**
 * Fills a local database with a plausible association year, so the dashboard
 * can be opened and judged on a real page rather than on a fixture.
 *
 * Pairs with BUDU_DEV_LOGIN (see lib/auth.ts): this writes the User row the
 * development sign-in then looks up. Nothing here talks to Kitsas — the entries
 * are invented, and the SyncRun row is what stops the page rendering its
 * "waiting for Kitsas" state over them.
 *
 *   node --env-file=.env.local scripts/seed-local.mjs
 *
 * Refuses to run against anything but a local database, because the tables it
 * clears include Budget, which is the one table production cannot rebuild.
 */
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(`Refusing to seed: DATABASE_URL is not a local database.\n  ${url.replace(/:[^:@/]*@/, ':***@')}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const EMAIL = process.env.BUDU_SEED_EMAIL || 'kehitys@pitkajarvenvaeltajat.fi';
const YEAR = Number(process.env.BUDU_SEED_YEAR) || new Date().getUTCFullYear();
const day = (year, month, date) => new Date(Date.UTC(year, month - 1, date));

/** Deterministic, so two runs produce the same page and a screenshot can be compared to the last one. */
let seed = 20260831;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const jitter = (base, pct) => Math.round(base * (1 + (rnd() * 2 - 1) * pct));

/**
 * The talousarvio, in the shape an imported one has: sections, a mix of income
 * and expense, and one line deliberately left without a Kitsas account so the
 * unmapped-account notice has something to be about.
 */
const LINES = [
  { group: 'Varsinainen toiminta', category: 'Kolon vuokra', planned: 10_200, account: 4401, kind: 'EXPENSE' },
  {
    group: 'Varsinainen toiminta',
    category: 'Kolon sähkö ja lämmitys',
    planned: 1_500,
    account: 4411,
    kind: 'EXPENSE',
  },
  { group: 'Varsinainen toiminta', category: 'Retket ja leirit', planned: 6_500, account: 4320, kind: 'EXPENSE' },
  {
    group: 'Varsinainen toiminta',
    category: 'Kammin huolto ja tarvikkeet',
    planned: 2_200,
    account: 4330,
    kind: 'EXPENSE',
  },
  {
    group: 'Varsinainen toiminta',
    category: 'Partiovarusteet ja -materiaali',
    planned: 1_800,
    account: 4340,
    kind: 'EXPENSE',
  },
  {
    group: 'Varsinainen toiminta',
    category: 'Johtajahuolto ja koulutus',
    planned: 1_200,
    account: 4350,
    kind: 'EXPENSE',
  },
  { group: 'Hallinto', category: 'Puhelin- ja verkkoyhteydet', planned: 1_000, account: 4911, kind: 'EXPENSE' },
  { group: 'Hallinto', category: 'Pankin palvelumaksut', planned: 180, account: 4921, kind: 'EXPENSE' },
  { group: 'Hallinto', category: 'Taloushallinnon palvelut', planned: 1_000, account: 4985, kind: 'EXPENSE' },
  { group: 'Hallinto', category: 'Vakuutukset', planned: 640, account: 4990, kind: 'EXPENSE' },
  { group: 'Varainhankinta', category: 'Jäsenmaksutuotot', planned: 16_000, account: 3010, kind: 'INCOME' },
  { group: 'Varainhankinta', category: 'Adventtikalenterimyynti', planned: 4_200, account: 3020, kind: 'INCOME' },
  { group: 'Varainhankinta', category: 'Leirimaksut', planned: 5_600, account: 3030, kind: 'INCOME' },
  { group: 'Avustukset', category: 'Kaupungin toiminta-avustus', planned: 3_500, account: 3110, kind: 'INCOME' },
  { group: 'Avustukset', category: 'Piirin avustukset', planned: 1_200, account: 3120, kind: 'INCOME' },
  // No Kitsas account: the row a talousarvio carries but the book cannot fill.
  { group: 'Avustukset', category: 'Testamenttilahjoitukset', planned: 0, account: null, kind: 'INCOME' },
];

/**
 * Recurring bookings, as a book actually accumulates them: rent every month,
 * accounting quarterly, a couple of big camp payments in the summer. Each entry
 * is generated for both the seeded year and the one before it, so the
 * comparison column and the modal's prior-year line have something in them.
 */
const MONTHLY = [
  { account: 4401, title: 'Toimitilavuokra', base: 850, pct: 0 },
  { account: 4411, title: 'Sähkölasku', base: 118, pct: 0.35 },
  { account: 4911, title: 'Puhelin- ja verkkolasku', base: 84, pct: 0.1 },
  { account: 4921, title: 'Pankin palvelumaksut', base: 15, pct: 0.2 },
  { account: 3010, title: 'Jäsenmaksusuoritukset', base: 1_150, pct: 0.45, kind: 'INCOME' },
];
const DATED = [
  { account: 4320, month: 2, title: 'Talvileirin majoitus, Kilpisjärvi', base: 980, pct: 0.1 },
  { account: 4320, month: 5, title: 'Kevätretken bussikuljetus', base: 620, pct: 0.15 },
  { account: 4320, month: 6, title: 'Kesäleirin ruokaostokset', base: 1_840, pct: 0.2 },
  { account: 4320, month: 7, title: 'Kesäleirin leirimaksu piirille', base: 1_450, pct: 0.1 },
  { account: 4320, month: 8, title: 'Purjehdusretken ruokaostokset', base: 480, pct: 0.25 },
  { account: 4330, month: 3, title: 'Kammin polttopuut', base: 340, pct: 0.15 },
  { account: 4330, month: 9, title: 'Kammin kattohuolto', base: 720, pct: 0.2 },
  { account: 4340, month: 4, title: 'Partiovarusteet, Scandinavian Outdoor', base: 640, pct: 0.2 },
  { account: 4340, month: 10, title: 'Uudet teltat ja makuualustat', base: 980, pct: 0.15 },
  { account: 4350, month: 1, title: 'Johtajien koulutusviikonloppu', base: 420, pct: 0.1 },
  { account: 4350, month: 11, title: 'Johtajahuollon illanvietto', base: 380, pct: 0.2 },
  { account: 4985, month: 3, title: 'Tilinpäätöksen laadinta', base: 620, pct: 0.05 },
  { account: 4985, month: 9, title: 'Kirjanpidon neljännesvuosipalvelu', base: 250, pct: 0.1 },
  { account: 4990, month: 1, title: 'Toiminnan vastuuvakuutus', base: 640, pct: 0 },
  { account: 3020, month: 11, title: 'Adventtikalenterimyynnin tilitys', base: 4_480, pct: 0.05, kind: 'INCOME' },
  { account: 3030, month: 6, title: 'Kesäleirin leirimaksut, 1. erä', base: 3_100, pct: 0.08, kind: 'INCOME' },
  { account: 3030, month: 7, title: 'Kesäleirin leirimaksut, 2. erä', base: 1_900, pct: 0.08, kind: 'INCOME' },
  { account: 3110, month: 4, title: 'Kaupungin toiminta-avustus', base: 3_500, pct: 0, kind: 'INCOME' },
  { account: 3120, month: 5, title: 'Piirin kohdeavustus', base: 900, pct: 0.2, kind: 'INCOME' },
];

/** A voucher entry as the sync stores it: the side it lands on is the line's business, not the booking's. */
function entry(id, occurredOn, account, description, euros, kind, attachments) {
  const cents = euros * 100;
  return {
    voucherId: id,
    entryId: 1,
    occurredOn,
    account,
    description,
    debetCents: kind === 'INCOME' ? 0 : cents,
    kreditCents: kind === 'INCOME' ? cents : 0,
    rawPayload: attachments ? { attachments } : undefined,
  };
}

function bookingsFor(year, throughMonth) {
  const rows = [];
  let id = year * 1000;
  for (const item of MONTHLY) {
    for (let month = 1; month <= throughMonth; month++) {
      rows.push(
        entry(
          ++id,
          day(year, month, 3),
          item.account,
          `${item.title} ${month}/${year}`,
          jitter(item.base, item.pct),
          item.kind,
        ),
      );
    }
  }
  for (const item of DATED) {
    if (item.month > throughMonth) continue;
    // A handful of vouchers carry a receipt, which is what the attachment chips render.
    const attachments =
      item.account === 4320 || item.account === 4411
        ? [{ id: id + 500, name: `kuitti-${item.month}-${year}.pdf`, type: 'application/pdf' }]
        : undefined;
    rows.push(
      entry(
        ++id,
        day(year, item.month, 14),
        item.account,
        item.title,
        jitter(item.base, item.pct),
        item.kind,
        attachments,
      ),
    );
  }
  return rows;
}

const monthsSoFar = YEAR === new Date().getUTCFullYear() ? new Date().getUTCMonth() + 1 : 12;

const user = await prisma.user.upsert({
  where: { email: EMAIL },
  update: {},
  create: { email: EMAIL, name: 'Kehityskäyttäjä' },
});

// Wholesale replacement, so a re-run is a clean reseed rather than a second copy.
await prisma.kitsasEntry.deleteMany({});
await prisma.budget.deleteMany({ where: { createdById: user.id } });

for (const year of [YEAR - 1, YEAR]) {
  const budget = await prisma.budget.create({
    data: {
      name: `Talousarvio ${year}`,
      startsOn: day(year, 1, 1),
      endsOn: day(year, 12, 31),
      createdById: user.id,
      lines: {
        create: LINES.map((line, index) => ({
          category: line.category,
          groupName: line.group,
          plannedCents: line.planned * 100,
          kitsasAccount: line.account,
          kind: line.kind,
          sortOrder: index,
        })),
      },
    },
  });
  // Without a completed SyncRun the dashboard shows its pending state and starts a real Kitsas fetch.
  await prisma.syncRun.create({
    data: {
      budgetId: budget.id,
      source: 'KITSAS',
      status: 'COMPLETED',
      imported: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  if (year === YEAR) {
    // Money on accounts the talousarvio maps nothing to, which is what the warning banner reads.
    await prisma.kitsasUnmappedAccount.createMany({
      data: [
        {
          budgetId: budget.id,
          account: 4360,
          name: 'Kilpailu- ja tapahtumamaksut',
          entries: 4,
          debetCents: 84_210,
          kreditCents: 0,
        },
        {
          budgetId: budget.id,
          account: 3040,
          name: 'Kirpputorimyynti',
          entries: 2,
          debetCents: 0,
          kreditCents: 44_200,
        },
      ],
    });
  }
}

const entries = [...bookingsFor(YEAR - 1, 12), ...bookingsFor(YEAR, monthsSoFar)];
await prisma.kitsasEntry.createMany({ data: entries });

console.log(`Seeded ${entries.length} entries across ${YEAR - 1}–${YEAR} for ${EMAIL}.`);
await prisma.$disconnect();
