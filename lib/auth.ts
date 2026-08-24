import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session { user: { id: string } & DefaultSession['user'] }
}
const domain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET ?? '',
    authorization: domain ? { params: { hd: domain } } : undefined,
  })],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google' || !user.email) return false;
      const email = user.email.toLowerCase();
      if (domain && !email.endsWith(`@${domain}`)) return false;
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
