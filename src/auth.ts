import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';

/**
 * Customer authentication.
 *
 * Self-hosted Auth.js rather than a hosted identity provider, because this
 * stack is headed for AWS and an auth vendor is the hardest thing to migrate
 * off: the user table stays in our own Postgres.
 *
 * Sessions are stored in the database, not signed into a JWT. That costs one
 * query per request but buys two things worth more: sign-ins survive
 * indefinitely without re-issuing tokens ("remember me" as asked for), and a
 * session can actually be revoked server-side — deleting the row logs that
 * device out immediately, which a stateless JWT cannot do.
 *
 * Note this is separate from the admin authentication in `src/lib/auth.ts`.
 * Admin access is a single operator credential held in environment variables;
 * this is the customer identity system.
 */

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

const databaseConfigured = Boolean(process.env.DATABASE_URL);

export const { handlers, signIn, signOut, auth } = NextAuth({
  // The adapter needs a database. Without one, fall back to no providers so the
  // app still builds and runs; sign-in simply reports itself unavailable.
  adapter: databaseConfigured
    ? DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,

  session: {
    strategy: databaseConfigured ? 'database' : 'jwt',
    maxAge: 60 * 60 * 24 * 90, // 90 days — customers should stay signed in
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
  },

  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          allowDangerousEmailAccountLinking: false,
        }),
      ]
    : [],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    session({ session, user }) {
      // Expose the user id so server code can scope queries without a lookup.
      if (session.user && user) session.user.id = user.id;
      return session;
    },
  },

  trustHost: true,
});

/**
 * Whether customer sign-in can work on this deployment.
 *
 * AUTH_SECRET is included deliberately: without it Auth.js returns 500 from
 * /api/auth/session, and SessionProvider polls that endpoint on every page, so
 * an unconfigured deployment fills the console with errors and looks broken.
 */
export function isCustomerAuthConfigured(): boolean {
  return googleConfigured && databaseConfigured && Boolean(process.env.AUTH_SECRET);
}
