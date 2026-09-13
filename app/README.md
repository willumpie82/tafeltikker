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
`child_session`; `/api/parent/**` and `/api/admin/**` routes only ever
read/write `parent_session` — the two cannot cross, verified by cross-session
curl checks during development.

### Parent roles

`parents.role` is one of:
- `parent` (default) — manages and sees only their own linked children.
- `user_admin` — manages *all* parent and child accounts (create via invite,
  reset any password, edit/reset-PIN any child) and sees every parent's
  feedback submissions in one place. Cannot see any child's practice stats —
  that stays between a child and their own linked parent(s).
- `system_admin` — everything `user_admin` can do, plus promoting a `parent`
  to `user_admin` (and back). `system_admin` itself is never grantable
  through the app — only set by `npm run db:seed` (the seeded account) or a
  direct DB edit, so there's always exactly one clear "owner" tier.

### Invite-based registration

There's no open signup. An admin generates a single-use, expiring invite
link from `/admin.html` (Uitnodigingen tab) and shares it manually — the app
never sends email. The new parent opens `/register.html?token=...`, which
validates the token via `GET /api/register/:token` before showing the form,
then `POST /api/register` creates their account (always role `parent`) and
logs them in.

## Parent portal & admin

The parent portal is a separate page (`/parent.html`, own bundle
`parent.js`) rather than a view inside the kid app, so the two never share
client-side state. Reached via the small icon in the corner of the kid app.
Log in with the account from `npm run db:seed` (or one created via an
invite). From there a parent can see per-child time practiced (today/week/
total), per-table accuracy, a 7-day accuracy trend, add children, edit a
child's name/avatar/PIN, and leave feedback.

`user_admin`/`system_admin` accounts see a "Beheer" link to `/admin.html`
(own bundle `admin.js`) — account administration and cross-parent feedback,
deliberately kept separate from `/parent.html` so admin duties never mix
with a specific family's own dashboard.

## Build

```sh
npm run build
npm start
```

## Deployment

Currently deployed as a Debian 13 LXC on Proxmox (unprivileged, 1 vCPU /
1GB RAM — `tsc` needs real headroom to compile, 512MB was not enough even
though the app itself runs comfortably lighter; `better-sqlite3` requires
Node ≥22, not the ≥20 this repo's `package.json` currently declares).

- `git clone --branch dev` into `/opt/tafeltikker/app`, `npm ci && npm run build`
  as a dedicated non-root `tafeltikker` user.
- `.env` (mode 600) with real, persistent `CHILD_SESSION_KEY`/
  `PARENT_SESSION_KEY` and a real admin password — never the docs' example
  values once anyone outside your own household can reach the instance.
- Run once after cloning/pulling: `npm run db:migrate`, `npm run db:seed`
  (seed only does anything the very first time — see `SEED_PARENT_*` above).
- `systemd` unit (`/etc/systemd/system/tafeltikker.service`, `EnvironmentFile=`
  pointing at `.env`) so it survives reboots and restarts on crash:
  ```ini
  [Unit]
  Description=Tafeltikker
  After=network.target

  [Service]
  Type=simple
  User=tafeltikker
  WorkingDirectory=/opt/tafeltikker/app/app
  ExecStart=/usr/bin/node dist/server.js
  Restart=on-failure
  RestartSec=5
  EnvironmentFile=/opt/tafeltikker/app/app/.env

  [Install]
  WantedBy=multi-user.target
  ```
- Redeploying a new commit: `git pull`, `npm ci` (only if dependencies
  changed), `npm run build`, `npm run db:migrate` (only if new migrations
  exist), `systemctl restart tafeltikker`.

### Going from LAN-only to a real HTTPS domain

The app itself never terminates TLS — it expects a reverse proxy (e.g.
nginx-proxy-manager) in front of it to do that, with Cloudflare (or
similar) pointed at the proxy. Once that's actually working end to end:

1. Set `PUBLIC_BASE_URL` (e.g. `https://tafeltikker.example.com`) so invite
   links stop embedding the LAN address.
2. Set `COOKIE_SECURE=true` and restart. Do this only *after* confirming
   HTTPS works — turning it on first silently breaks login, since a
   browser never sends a `Secure` cookie over plain HTTP.

`trustProxy: true` is already on by default (harmless with no proxy in
front), so `request.ip` reflects the real client once one exists.
