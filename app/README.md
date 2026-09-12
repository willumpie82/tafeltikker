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
migrations) before starting the server.

## Build

```sh
npm run build
npm start
```
