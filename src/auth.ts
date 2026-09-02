import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { cookies } from 'next/headers';
import { getDatabase } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { ANONYMOUS_COOKIE, mergeCarts } from '@/lib/cart-server';

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
  // getDatabase() rather than the `db` proxy: the adapter identifies the
  // dialect by prototype and rejects a proxy. Safe here because this branch
  // only runs when DATABASE_URL is set.
  adapter: databaseConfigured
    ? DrizzleAdapter(getDatabase(), {
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
    /**
     * Build the session object explicitly.
     *
     * This must never spread the adapter's row. With the database strategy the
     * `session` argument IS the `sessions` row joined to the whole `users`
     * row, and returning it shipped `sessionToken` — the login credential
     * itself — plus every user column to the browser. Once a `password_hash`
     * column existed, that endpoint was serving password hashes to any script
     * on the page, on every request, because SessionProvider polls it.
     *
     * So the shape is listed field by field. A new column added to `users`
     * then stays server-side unless someone deliberately adds it here.
     */
    session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          // The id lets server code scope queries without a second lookup.
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      };
    },
  },

  events: {
    /**
     * Fold the visitor's anonymous cart into their account cart.
     *
     * This is the moment the two identities meet: everything added before
     * signing in is filed under a cookie id, everything after under the user
     * id. Without this step a customer who fills a basket and then signs in to
     * pay watches it empty — the most expensive possible moment to lose a cart.
     *
     * Runs as an event rather than a callback because its result must not gate
     * sign-in: a merge failure is a lost cart, but a thrown error here would be
     * a customer who cannot log in at all. Hence the catch.
     */
    async signIn({ user }) {
      if (!user?.id) return;

      try {
        const anonymousId = (await cookies()).get(ANONYMOUS_COOKIE)?.value;
        if (anonymousId) await mergeCarts(user.id, anonymousId);
      } catch (err) {
        console.error('cart merge on sign-in failed (ignored)', err);
      }
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
