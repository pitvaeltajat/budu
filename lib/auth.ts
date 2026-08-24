import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session { user: { id: string } & DefaultSession['user'] }
}
/**
 * Allowed Google Workspace domains, comma-separated. Enforcement is on the
 * `hd` claim rather than the email suffix: `hd` is asserted by Google for
 * Workspace accounts, whereas an email suffix proves nothing on its own and an
 * alias address can carry a domain that differs from the account's own.
 * An account with no `hd` (any consumer Gmail) is rejected outright.
 */
const domains = (process.env.GOOGLE_WORKSPACE_DOMAIN ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

/** The `hd` request param only narrows Google's account chooser; it is a hint, not a control. */
const hdHint = domains.length === 1 ? domains[0] : domains.length > 1 ? '*' : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET ?? '',
    authorization: hdHint ? { params: { hd: hdHint } } : undefined,
  })],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google' || !user.email) return false;
      const email = user.email.toLowerCase();
      if (profile && profile.email_verified === false) return false;
      if (domains.length) {
        const hd = typeof profile?.hd === 'string' ? profile.hd.trim().toLowerCase() : null;
        if (!hd || !domains.includes(hd)) return false;
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
