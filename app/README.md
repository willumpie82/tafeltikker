# Tafeltikker app

Backend + frontend for Tafeltikker, built with Fastify + TypeScript.

## Development

```sh
npm install
npm run dev
```

Server listens on `http://localhost:3000` by default (see `.env.example`).
`GET /healthz` returns `{ "status": "ok" }` once it's up.

## Database

SQLite via Drizzle ORM. The DB file lives at `data/tafeltikker.sqlite` by
default (override with `DB_PATH`), and is created automatically — it's
gitignored, never committed.

```sh
npm run db:generate   # after changing src/db/schema.ts, writes a migration to drizzle/
npm run db:migrate    # applies pending migrations to DB_PATH
```

Run `db:migrate` once after `npm install` (and again after pulling new
migrations) before starting the server. `npm run db:seed` creates a first
parent account and two demo children (see `.env.example` for the credentials
it uses) — skips if the `parents` table isn't empty.

## Environment

See `.env.example` for all variables. Sensible defaults exist for local dev
(you can run `npm run dev` with no `.env` at all); `CHILD_SESSION_KEY` and
`PARENT_SESSION_KEY` should be set explicitly in production (e.g. via the
systemd unit's `EnvironmentFile`), otherwise a throwaway key is generated on
every process start and sessions won't survive a restart.

## Auth model

Two independent session cookies, `child_session` and `parent_session`, each
signed with their own key. `/api/child/**` routes only ever read/write
`child_session`; `/api/parent/**` routes only ever read/write
`parent_session` — the two cannot cross, verified by cross-session curl
checks during development.

## Parent portal

Served as a separate page (`/parent.html`, own bundle `parent.js`) rather
than a view inside the kid app, so the two never share client-side state.
Reached via the small icon in the corner of the kid app. Log in with the
account from `npm run db:seed` (or one you create directly in the `parents`
table). From there a parent can see per-child time practiced (today/week/
total), per-table accuracy, a 7-day accuracy trend, add children, and edit a
child's name/avatar/PIN.

## Build

```sh
npm run build
npm start
```
