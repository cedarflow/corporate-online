# Corporate Online

An internal, Ownr-style platform for staff to incorporate and maintain Canadian corporations. It runs on **Cloudflare Workers + D1**.

## What it does

- **Incorporation wizard**: client, jurisdiction (Federal, Ontario, BC, Alberta), named or numbered company, details, directors, share structure and initial shareholders. You can also **import** an existing corporation.
- **Name checks**: a live preview of the legal name, legal-ending validation per jurisdiction, restricted-word and generic-name warnings, and a check for similar names already in the system. Reminders cover NUANS and Name Requests.
- **Incorporation pipeline**: Draft → Name review → Ready to file → Filed → Active, with a generated task checklist.
- **Digital minute book**:
  - Registers of directors and officers.
  - Share classes, shareholders and a share ledger covering issuances, transfers and redemptions. Holdings are validated as of each transaction date.
  - A cap table with equity % and voting %.
  - A register of individuals with significant control (ISC).
  - Share certificates.
  - The complete minute book as one printable document.
- **Resolution templates**: organizational resolutions (directors and shareholders), annual resolutions, share issuance, share transfer, director change, and custom. Templates pre-fill from company records, can be edited, and are marked signed once executed. All of them print to PDF.
- **Compliance calendar**:
  - Annual returns (jurisdiction rule based on the incorporation anniversary).
  - CRA tax balance and T2 due dates, plus annual resolutions, based on the fiscal year end.
  - Business name renewals.
  - Overdue badges, and a schedule that rolls forward when an item is marked filed.
- **Clients**, **business name registrations** (Ontario's 5-year term is calculated), **tasks** with assignees, an **activity log**, and **team management** with admin and staff roles.

Jurisdiction rules are operational defaults, not legal advice. Review and edit them in `src/lib/jurisdictions.ts`. Resolution wording lives in `src/lib/resolutions.ts`.

## Stack

- [Hono](https://hono.dev) with server-rendered JSX. No client framework; there's one small vanilla script.
- Cloudflare D1 (SQLite). The schema is in `migrations/`.
- Authentication: email and password, hashed with PBKDF2-SHA256 through Web Crypto. Sessions use HMAC-signed, `HttpOnly`, `SameSite=Lax` cookies.
- Protections: Origin-checked CSRF, strict security headers and a Content Security Policy.

## Local development

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars   # then set SESSION_SECRET to a long random string
```

```bash
npm run db:migrate:local
```

```bash
npm run dev    # http://localhost:8787
```

On first visit you're taken to `/setup` to create the admin account. To explore with sample data, go to **Team & settings → Load demo data**.

```bash
npm test          # domain logic unit tests
```

```bash
npm run typecheck
```

## Deploy to Cloudflare

1. Create the database, then copy the printed `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create corporate-online
   ```
2. Apply the migrations to the remote database:
   ```bash
   npm run db:migrate:remote
   ```
3. Set the session secret:
   ```bash
   openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```
5. Visit the Worker URL and complete `/setup` **straight away**. Until the first admin exists, anyone who reaches the URL can claim it.

**Recommended:** because this is an internal tool, put it behind **Cloudflare Access** (Zero Trust → Access → Applications). Only your staff can then reach it, and the built-in login is a second layer. Add a custom domain under the Worker's *Settings → Domains & Routes*.

## Project layout

```
migrations/          D1 schema
src/index.tsx        app, auth, middleware, route mounting
src/routes/          dashboard, companies, records, resolutions, documents, clients,
                     business names, compliance, tasks, team
src/lib/             domain logic (compliance dates, cap table, names, templates), D1 helpers
src/views/           layout, components, CSS/JS
test/                unit tests (node --test)
```
