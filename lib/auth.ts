import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

// Augmented on `@auth/core/jwt`, not `next-auth/jwt`: the latter is a bare
// `export * from '@auth/core/jwt'` re-export and TypeScript refuses to augment
// it. That is the only reason `@auth/core` is a direct devDependency here —
// nothing imports it at runtime, and it is pinned to the exact version
// next-auth depends on. Klapi carries the same dependency for the same reason.
declare module '@auth/core/jwt' {
  interface JWT {
    /** Budu's own User.id — namespaced, because the cookie is shared with Klapi. */
    buduUserId?: string;
    /** Google's verified hosted domain, or null for a personal account. */
    hd?: string | null;
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
 * The parent domain the session cookie is pinned to, e.g. `.pitva.fi`. Setting
 * it is what makes one sign-in cover Budu and Klapi both.
 *
 * Two things must match Klapi exactly or neither app can read the other's
 * cookie, and both fail silently:
 *   - AUTH_SECRET here must equal NEXTAUTH_SECRET there, and
 *   - the cookie NAME must be identical, because @auth/core derives the JWE
 *     key with HKDF salted by it (`lib/actions/session.js`: `const salt =
 *     options.cookies.sessionToken.name`). Hence the literal name below rather
 *     than the library default.
 *
 * Unset — localhost, previews — the cookie stays host-scoped as before.
 */
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

/**
 * Whether an account is inside the Workspace domain fence, judged from the
 * `hd` claim recorded at sign-in.
 *
 * This exists because `signIn` below is no longer the only way into a Budu
 * session. With the cookie shared across pitva.fi, a person can sign in on
 * Klapi — which deliberately admits pre-Workspace personal Gmail accounts —
 * and arrive here holding a valid session that Budu's own `signIn` never
 * judged. So the fence is re-checked on every read instead of once at the
 * door.
 *
 * Fails closed: a token with no `hd` claim at all (an older session, or a
 * personal account) is refused whenever a domain list is configured.
 */
function isInsideDomainFence(hd: unknown): boolean {
  if (!allowedDomains.length) return true;
  return typeof hd === 'string' && allowedDomains.includes(hd.trim().toLowerCase());
}

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
  // Only overridden when a parent domain is configured, so local and preview
  // deploys keep the stock host-scoped defaults. `__Secure-` and not
  // `__Host-`: the `__Host-` prefix forbids the Domain attribute this needs to
  // set. The CSRF cookie is left alone — it stays `__Host-` and per-app.
  ...(COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            // Deliberately NOT the Auth.js default name. Klapi and Budu
            // already had host-scoped cookies called
            // `__Secure-authjs.session-token`; reusing it for the
            // domain-scoped one left every existing user holding two cookies
            // with a single name, the browser sending both, and Auth.js
            // picking the stale one — "no matching decryption secret" on every
            // request, with no way to recover. A distinct name makes the old
            // cookie simply irrelevant: ignored, and expired by its own maxAge.
            name: '__Secure-pitva.session-token',
            options: {
              httpOnly: true,
              sameSite: 'lax' as const,
              path: '/',
              secure: true,
              domain: COOKIE_DOMAIN,
            },
          },
          // The CSRF cookie is renamed for the same reason as the session one,
          // and it is the more urgent of the two. Its value is HMAC'd with the
          // auth secret, so every cookie minted under the old secret now fails
          // to verify — and Auth.js rejects the sign-in POST with MissingCSRF
          // *before* it ever checks the password. That is not a stale session
          // that expires on its own: it is a browser that cannot sign in at
          // all until someone clears site data by hand, which on a kiosk means
          // physical access.
          //
          // Renaming sidesteps it. The stale cookie stops being consulted, a
          // fresh one is minted on the next request, and nobody has to touch a
          // machine. Stays `__Host-` (secure, path=/, no Domain) — CSRF is
          // per-app and must not be shared across pitva.fi.
          csrfToken: {
            name: '__Host-pitva.csrf-token',
            options: {
              httpOnly: true,
              sameSite: 'lax' as const,
              path: '/',
              secure: true,
            },
          },
        },
      }
    : {}),
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
    async jwt({ token, account, profile }) {
      // Record Google's `hd` claim at sign-in. Klapi records the same claim
      // under the same name, so a session minted there can still be judged by
      // `isInsideDomainFence` below. `profile` is only populated on this pass.
      if (account?.provider === 'google') {
        token.hd = typeof profile?.hd === 'string' ? profile.hd.trim().toLowerCase() : null;
      }

      // Budu's own User.id, namespaced: the cookie is shared with Klapi, which
      // keeps its users in a different database. A bare `userId` claim had the
      // two apps overwriting each other's primary keys on every request.
      if (token.email) {
        token.buduUserId = (await prisma.user.findUnique({ where: { email: token.email } }))?.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Identity is shared across pitva.fi; entitlement is not. A session
      // minted by Klapi is proof of who someone is, never proof that Budu
      // should admit them — Klapi admits pre-Workspace personal Gmail accounts
      // that this domain fence exists to keep out. Leaving `user.id` unset is
      // what makes `adminSession()` and every caller of it deny.
      if (!isInsideDomainFence(token.hd)) return session;
      if (session.user && typeof token.buduUserId === 'string') session.user.id = token.buduUserId;
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
