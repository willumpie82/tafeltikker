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
`child_session`; a `/api/parent/**` route group (added alongside the parent
portal) will only read/write `parent_session` — the two cannot cross.

## Build

```sh
npm run build
npm start
```
