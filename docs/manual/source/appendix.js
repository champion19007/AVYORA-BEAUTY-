// Reference appendices generated from facts.json (extracted from the code by extract.mjs),
// so they cannot drift from what is actually built.
const facts = require('./facts.json');

const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

// Plain-language purpose for tables whose code comment is missing or too technical.
const PURPOSE = {
  users: 'Customer accounts (Google, email or phone sign-in).',
  otp_codes: 'One-time sign-in and verification codes, stored hashed, five guesses each, ten minutes.',
  accounts: 'Links a customer to an outside sign-in provider such as Google (Auth.js).',
  sessions: 'Customer sign-in sessions, stored in the database so they can be revoked.',
  verification_tokens: 'Auth.js email verification tokens.',
  addresses: 'Saved delivery addresses, and the address frozen onto each order.',
  catalog_products: 'One row per product: stable id, slug, name, category.',
  catalog_variants: 'One row per sellable size (SKU) with a stable id such as retinol-90ml.',
  carts: 'A shopping bag kept on the server, for guests and accounts.',
  cart_items: 'Lines in a server-side bag: SKU and quantity, never a price.',
  reviews: 'Product reviews from verified buyers, unpublished until staff approve.',
  consent_records: 'Append-only record of each permission granted or withdrawn (saving routines, photos).',
  skin_profiles: 'Quiz answers a customer chose to save, with expiry.',
  routine_results: 'Saved routines with the engine, knowledge release and versions that produced them.',
  routine_schedule_slots: 'One row per step of a saved weekly routine (day, morning or evening, position).',
  scan_sessions: 'Optional face-photo sessions (feature switched off); photo kept at most 24 hours.',
  routine_feedback: 'Weekly "how is it going" answers on a saved routine.',
  support_requests: 'Messages sent through the contact form, answered from the owner console.',
  newsletter_subscribers: 'Newsletter sign-ups with double opt-in (feature switched off).',
  activity_events: 'Anonymous usage events for analytics.',
  orders: 'Every order: customer, totals in paise, payment and fulfilment status, risk check, courier shipment.',
  order_items: 'The lines of an order, with name, size and price frozen at the time of sale.',
  inventory: 'Stock on hand per SKU, low-stock level, and whether backorders are allowed.',
  restock_requests: 'Requests for more stock, raised by the manager or the morning autopilot, closed by the owner.',
  product_pricing: 'Owner-set prices and offers per SKU, versioned so two edits cannot overwrite each other.',
  rate_limits: 'Durable counters behind every rate limit and the AI chat spending budget.',
  domain_events: 'The event log (outbox): order placed, paid, shipped, and so on, written in the same transaction.',
  event_deliveries: 'Which consumer has handled which event, with retries and failures.',
  consumer_registrations: 'Where each event consumer started reading the log.',
  ingredients: 'The canonical ingredient dictionary (INCI names, classes, caution flags).',
  ingredient_aliases: 'Alternative names for ingredients, including deliberately ambiguous ones.',
  evidence_sources: 'Sources cited by reviewed knowledge records.',
  formulations: 'Versioned full ingredient lists per product (none recorded yet).',
  formulation_ingredients: 'Each ingredient position in a formulation, with concentration if known.',
  usage_profiles: 'Approved directions per formulation version (none approved yet).',
  ingredient_interactions: 'Rules about ingredients that should not be combined.',
  routine_items: 'Legacy routine line items.',
  idempotency_keys: 'Makes retried requests safe: the same key returns the same result.',
  audit_logs: 'Who changed what, and when: prices, stock, order status, publishing, courier bookings.',
  payment_events: 'Every payment provider event, recorded once, with what it changed.',
  wishlist_items: 'Saved products for signed-in customers.',
  cms_documents: 'Site content managed in the CMS: product copy, articles, pages.',
  cms_revisions: 'Every saved version of a CMS document, for restore.',
  media_assets: 'Images uploaded through the CMS.',
  jobs: 'Background job queue with leases, retries and dead letters.',
  export_watermarks: 'Progress markers for exporting events to analytics storage.',
  kb_releases: 'Immutable, checksummed releases of the skincare knowledge base.',
  kb_active_release: 'Which knowledge release is live, and the previous one for rollback.',
  scan_admissions: 'Quota records for photo scans, kept after scans are deleted.',
  scan_attempts: 'Paid model calls per scan (at most two).',
  environmental_cache: 'Cached UV, humidity and air-quality readings per region.',
};

const PAGE_PURPOSE = (p) => {
  const map = [
    [/^\/$/, 'Home page'],
    [/^\/admin-login/, 'Staff sign-in (owner and manager)'],
    [/^\/admin\/orders\/\[/, 'Owner: one order, with risk and attention panels'],
    [/^\/admin\/orders/, 'Owner: all orders'],
    [/^\/admin\/inventory/, 'Owner: stock levels'],
    [/^\/admin\/pricing/, 'Owner: prices and offers'],
    [/^\/admin\/content/, 'Owner: CMS'],
    [/^\/admin\/analytics/, 'Owner: sales, units, days of cover'],
    [/^\/admin\/requests/, 'Owner: restock requests, support messages, reviews to moderate'],
    [/^\/admin\/system/, 'Owner: queues, dead jobs, scan backlog'],
    [/^\/admin\/knowledge/, 'Owner: knowledge releases'],
    [/^\/admin\/catalogue/, 'Owner: catalogue record preview'],
    [/^\/admin$/, 'Owner console overview'],
    [/^\/manager\/help/, 'Stockroom: step-by-step help'],
    [/^\/manager\/stock/, 'Stockroom: stock counts and requests'],
    [/^\/manager\/requests/, 'Stockroom: restock request history'],
    [/^\/manager$/, 'Stockroom: dispatch queue'],
    [/^\/checkout\/return/, 'Return page after the Cashfree payment screen'],
    [/^\/checkout/, 'Checkout'],
    [/^\/orders\/\[orderNumber\]\/invoice/, 'Printable invoice'],
    [/^\/orders\//, 'Order confirmation and tracking (owner or signed link only)'],
    [/^\/account/, 'Customer account area'],
    [/^\/products\//, 'Product page'],
    [/^\/collections/, 'Shop: all products with filters'],
    [/^\/routine-finder/, 'Routine finder questionnaire and weekly plan'],
    [/^\/skin-chat/, 'AI skin chat (signed-in customers)'],
    [/^\/assistant/, 'Ask Avyora: on-device answers, no AI'],
    [/^\/journal/, 'Journal articles from the CMS'],
    [/^\/scan/, 'Optional face photo (switched off)'],
    [/^\/track-order/, 'Track an order by number and email'],
    [/^\/wishlist/, 'Wishlist'],
    [/^\/compare/, 'Compare products'],
    [/^\/login|^\/signup/, 'Customer sign-in and sign-up'],
    [/^\/newsletter/, 'Newsletter confirm and unsubscribe'],
    [/^\/design-system/, 'Internal design review page (not linked)'],
    [/^\/(privacy|terms|refund|shipping|contact)/, 'Policy and contact page'],
  ];
  return (map.find(([re]) => re.test(p)) || [null, ''])[1];
};

module.exports = function appendix(parse) {
  let md = '::part Reference appendices\nGenerated from the code itself on 21 October 2026, so they list exactly what exists: every database table and column, every page and API address, every setting, every database migration and every automated test file.\n\n';

  // A. Database
  md += '# Appendix A. Database tables\n\n';
  md += `The database has **${facts.tables.length} tables** with **${facts.tables.reduce((s, t) => s + t.cols.length, 0)} columns**, defined in \`src/db/schema.ts\` and created by the migrations in \`drizzle/\`. Money is always stored as whole **paise** (₹1 = 100 paise) in integer columns, so no rounding error can enter a total. Times are stored with time zone.\n\n`;
  md += '## Status values\n\n| Type | Allowed values |\n| --- | --- |\n';
  for (const e of facts.enums) md += `| ${e.name} | ${e.values.join(', ')} |\n`;
  md += '\n';
  for (const t of facts.tables) {
    md += `### ${t.name}\n\n${esc(PURPOSE[t.name] || t.doc || 'Supporting table.')}\n\n`;
    md += '| Column | Type | Required | Notes |\n| --- | --- | --- | --- |\n';
    for (const c of t.cols) {
      const notes = [c.pk ? 'primary key' : '', c.fk ? 'links to another table' : ''].filter(Boolean).join(', ');
      md += `| ${c.column} | ${c.type} | ${c.notNull || c.pk ? 'yes' : 'no'} | ${notes || '—'} |\n`;
    }
    md += '\n';
  }

  // B. Pages and APIs
  md += '# Appendix B. Pages and API addresses\n\n';
  const pages = facts.routes.filter((r) => r.kind === 'page');
  const apis = facts.routes.filter((r) => r.kind === 'api');
  md += `The site has **${pages.length} pages** and **${apis.length} API addresses**. Square brackets mark a variable part, for example \`/products/[slug]\`.\n\n## Pages\n\n| Address | What it is |\n| --- | --- |\n`;
  for (const r of pages) md += `| ${esc(r.path)} | ${esc(PAGE_PURPOSE(r.path) || '—')} |\n`;
  md += '\n## API addresses\n\n| Address | Methods | Purpose (from the code) |\n| --- | --- | --- |\n';
  for (const r of apis) md += `| ${esc(r.path)} | ${r.methods.join(', ') || 'GET, POST'} | ${esc(r.doc.split('. ')[0] || '—')} |\n`;
  md += '\n';

  // C. Settings
  md += '# Appendix C. Settings (environment variables)\n\n';
  md += `There are **${facts.env.length} settings**, documented in \`.env.example\`. They are set in Vercel under Project → Settings → Environment Variables, and locally in \`.env.local\`. **Never commit real values.** Run \`npm run check:env -- --production\` to check a deployment's settings without printing any secret.\n\n`;
  md += '| Setting | What it is for |\n| --- | --- |\n';
  for (const e of facts.env) md += `| ${e.name} | ${esc(e.note || (e.section ? e.section : '—'))} |\n`;
  md += '\n';

  // D. Migrations
  md += '# Appendix D. Database migrations\n\n';
  md += 'Each migration is a SQL file applied in order by `npm run db:migrate`. Production migrations are applied by hand, after the owner approves, against the production connection string.\n\n| # | File |\n| --- | --- |\n';
  facts.migrations.forEach((m, i) => (md += `| ${String(i).padStart(4, '0')} | ${m} |\n`));
  md += '\n';

  // E. Tests
  md += '# Appendix E. Automated test files\n\n';
  md += `**${facts.tests.length} test files**, run with \`npm test\`. Files ending \`.integration.test.ts\` run against a real Postgres engine (PGlite) built from the same migrations as production.\n\n| Test file |\n| --- |\n`;
  for (const t of facts.tests) md += `| ${t} |\n`;
  return parse(md);
};
