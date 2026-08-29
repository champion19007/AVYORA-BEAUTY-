import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Migrations are generated as SQL files and committed, rather than pushed
  // straight to the database. They are reviewable, replayable, and work the
  // same against RDS later as against Neon now.
  strict: true,
  verbose: true,
} satisfies Config;
