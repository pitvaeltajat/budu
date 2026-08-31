import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
/**
 * Allowed Google Workspace domains, comma-separated. Enforcement is on the
 * `hd` claim rather than the email suffix: `hd` is asserted by Google for
 * Workspace accounts, whereas an email suffix proves nothing on its own and an
 * alias address can carry a domain that differs from the account's own.
 * An account with no `hd` (any consumer Gmail) is rejected outright.
 */
export const allowedDomains = (process.env.GOOGLE_WORKSPACE_DOMAIN ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

/** The `hd` request param only narrows Google's account chooser; it is a hint, not a control. */
const hdHint = allowedDomains.length === 1 ? allowedDomains[0] : allowedDomains.length > 1 ? '*' : undefined;

/**
 * A password-less sign-in for local work, because Google OAuth cannot be
 * exercised from a laptop against a throwaway database — every dashboard change
 * would otherwise have to be judged from a hand-written fixture rather than the
 * page people actually get.
 *
 * Two independent gates, both of which must hold. `NODE_ENV` is fixed to
 * `production` by `next build`, so a deploy cannot reach this branch whatever
 * the environment says; `BUDU_DEV_LOGIN` then means a developer has to ask for
 * it by name even in development. The provider is absent from `providers` when
 * either gate fails, so its route does not exist rather than existing and
 * refusing — there is no endpoint to probe.
 */
export const devLoginEnabled = process.env.NODE_ENV !== 'production' && process.env.BUDU_DEV_LOGIN === '1';

export const { handlers, auth, signIn, signOut } = NextAuth({
  /** A rejected sign-in lands back on the login page, which explains the domain rule in Finnish. */
  pages: { signIn: '/login', error: '/login' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET ?? '',
      authorization: hdHint ? { params: { hd: hdHint } } : undefined,
    }),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: 'dev',
            name: 'Kehitystunnus',
            credentials: { email: { label: 'Sähköposti', type: 'email' } },
            authorize: async (credentials) => {
              const email = String(credentials?.email ?? '')
                .trim()
                .toLowerCase();
              if (!email) return null;
              // Signs in as an existing row only. Seeding is the seed script's
              // job, so a typo fails the login instead of quietly creating a
              // second account that owns nothing.
              return await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'dev') return devLoginEnabled;
      if (account?.provider !== 'google' || !user.email) return false;
      const email = user.email.toLowerCase();
      if (profile && profile.email_verified === false) return false;
      if (allowedDomains.length) {
        const hd = typeof profile?.hd === 'string' ? profile.hd.trim().toLowerCase() : null;
        if (!hd || !allowedDomains.includes(hd)) return false;
      }
      await prisma.user.upsert({
        where: { email },
        update: { name: user.name, image: user.image },
        create: { email, name: user.name, image: user.image },
      });
      return true;
    },
    async jwt({ token }) {
      if (token.email) token.userId = (await prisma.user.findUnique({ where: { email: token.email } }))?.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === 'string') session.user.id = token.userId;
      return session;
    },
  },
});

/**
 * Emails allowed to change the shared talousarvio, comma-separated. Reading it
 * is open to everyone who can sign in, so this is the only gate left standing
 * on the write paths: import, edit and delete.
 *
 * An empty list leaves every signed-in user an admin, which is what Budu did
 * before the list existed. That is not "open to anyone": `signIn` above already
 * turns away every account outside `GOOGLE_WORKSPACE_DOMAIN`, so the widest
 * this setting can get is the organisation itself.
 */
const adminEmails = (process.env.BUDU_ADMIN_EMAILS ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email?: string | null) {
  if (!adminEmails.length) return true;
  return typeof email === 'string' && adminEmails.includes(email.toLowerCase());
}

/**
 * The session when it belongs to an admin, otherwise the reason it does not.
 * Server Actions are reachable as bare POST requests and not only through the
 * UI that renders them, so every write path calls this for itself rather than
 * trusting that the admin page declined to draw the button.
 */
export async function adminSession() {
  const session = await auth();
  if (!session?.user?.id) return { session: null, error: 'Kirjautuminen vaaditaan.', status: 401 as const };
  if (!isAdminEmail(session.user.email))
    return { session: null, error: 'Vain ylläpitäjä voi muuttaa talousarviota.', status: 403 as const };
  return { session, error: null, status: 200 as const };
}
