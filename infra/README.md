# Tafeltikker infra

How the live instance is actually provisioned and operated — as-built, not
aspirational. Update this when the real deployment changes, not just when
you mean to change it.

## Target environment

Debian 13 LXC on Proxmox, unprivileged.

- **2 vCPU / 2GB RAM / 4GB disk.** Started at 1 vCPU/512MB, which OOM'd
  during `tsc` (the compile step needs real headroom even though the app
  runs comfortably lighter at runtime — under 50MB resident). Bumped to
  1GB, still slow enough to time out interactive sessions; settled on
  2GB/2 cores since the Proxmox host has plenty of spare capacity and
  there's no reason to keep re-fighting this.
- **Node.js ≥22** — `better-sqlite3` requires it. (`app/package.json`'s
  `engines.node` says `>=20`; that's wrong and has been for a while — Node
  20 happens to still load the native binding without erroring, but 22 is
  what's actually required and what's actually installed.)
- Bridged networking (`vmbr0`, DHCP) — same convention as this Proxmox
  host's other service containers.

## Branch strategy

`main` is the deployed branch — `dev` is where work happens. Merge
(fast-forward; `main` should never carry commits `dev` doesn't have) into
`main` when `dev` is ready to ship, then redeploy from `main` (see below).

This wasn't always the convention — for the first stretch of this
project's life, `dev` was cloned straight to production and `main` sat
untouched at the original scaffold commit, 40+ commits behind. If `main`
and `dev` have diverged unexpectedly, that's a bug in how they're being
used, not a design of the setup — they should only ever differ by `dev`
being ahead.

## Initial provisioning

```sh
# as the tafeltikker user, in /opt/tafeltikker/app
git clone --branch main <repo-url> .
cd app
npm ci
npm run build
```

Then, once (not on every deploy):

```sh
cp .env.example .env   # then fill in real values, see below
chmod 600 .env
npm run db:migrate
npm run db:seed        # only does anything if the parents table is empty
```

`.env` needs real, persistent values before this is reachable by anyone
outside your own household — never the `.env.example` placeholders:
- `CHILD_SESSION_KEY` / `PARENT_SESSION_KEY` / `GROUP_TRUST_KEY` (once
  groups ships) — random hex keys. Without these set, a throwaway key is
  generated on every process start and every session is lost on restart.
- `SEED_PARENT_USERNAME` / `SEED_PARENT_PASSWORD` — the first admin
  account `db:seed` creates. Reset the password via the app afterward if
  you want to stop using whatever was in `.env` at seed time.
- `PUBLIC_BASE_URL` / `COOKIE_SECURE` — see "HTTPS" below; leave both
  unset/false until HTTPS is actually working end to end.

## systemd

`infra/tafeltikker.service` in this repo is the real, currently-deployed
unit file — copy it to `/etc/systemd/system/tafeltikker.service` on the
LXC (don't hand-retype it):

```sh
cp infra/tafeltikker.service /etc/systemd/system/tafeltikker.service
systemctl daemon-reload
systemctl enable --now tafeltikker
```

## Redeploying

```sh
cd /opt/tafeltikker/app
git pull
cd app
npm ci               # only if package.json/package-lock.json changed
npm run build
npm run db:migrate   # only if new migrations exist — safe no-op otherwise
systemctl restart tafeltikker
```

**The restart is not optional, even for a client-only (CSS/JS) change.**
Static assets under `public/` are served straight from disk on every
request, so those update without a restart — but the running Node process
keeps serving whatever `dist/server.js` looked like when it started, so
any change touching `app/src/*` (excluding `app/src/client/**`, which
esbuild bundles into `public/*.js`) needs the restart to actually take
effect. Forgetting this once shipped a broken feature that looked
deployed (new frontend code was live) but 404'd on its backend route
(the old server process had never heard of it) — verify with
`journalctl -u tafeltikker --no-pager -n 20` and a `curl localhost:3000`
smoke test after every deploy, not just a glance at `git log`.

**Quick version check** — `GET /healthz` reports the *running* process's
version (read from `package.json` at startup, not baked in at build time):
```sh
curl -s localhost:3000/healthz          # what's actually running
grep '"version"' app/package.json       # what's on disk right now
```
A mismatch means the restart above hasn't actually happened yet — this
only catches it if the version in `package.json` was bumped as part of
the change being deployed, which isn't automatic and won't happen for
every commit, but it turns the common case from "hope you remembered"
into something you can actually check in one command.

## Operating the container

This LXC lives on a Proxmox host reached over VPN, which has been
observed to drop SSH mid-session under load — don't assume a command that
timed out actually failed on the *remote* end; re-check state before
retrying anything non-idempotent (see "Before touching the live database"
below for why this matters more than usual here).

**Preferred: SSH to the Proxmox host, then `pct exec`.** Don't SSH
directly to the container unless you know its root password is actually
set — the container's own console/SSH may have no working login, while
the Proxmox host's shell (reachable via SSH or the web UI's own
`>_ Shell` on the host node) always has privileged `pct` access with no
separate password, since it rides the host's own authenticated session.

```sh
ssh proxmox                     # or open ">_ Shell" on the host node in the web UI
pct exec 131 -- su - tafeltikker -c '<command>'   # run as the app's own user
pct exec 131 -- systemctl restart tafeltikker      # service control needs root, no su
```

Almost everything (git, npm, node) should run as `tafeltikker`, not
`root` — running as root creates root-owned files in a `tafeltikker`-owned
tree, which then breaks the next command that runs as the real user.

**Resizing the container** (memory/cores) applies live via cgroups, no
reboot needed:

```sh
pct set 131 --memory 2048 --cores 2
pct config 131 | grep -E 'memory|cores'   # confirm it took
```

## Before touching the live database

Always checkpoint and back up before any operation that touches the
running SQLite file directly (a git checkout that could somehow interact
with it, a manual schema fix, moving the file) — `app/data/` is untracked
and git operations don't touch it directly, but the discipline matters
enough to make automatic rather than "should be fine this time":

```sh
cd /opt/tafeltikker/app/app
node -e 'const db=require("better-sqlite3")("data/tafeltikker.sqlite"); db.pragma("wal_checkpoint(FULL)"); db.close();'
cp data/tafeltikker.sqlite data/tafeltikker.sqlite.$(date +%Y%m%d-%H%M).bak
```

The checkpoint matters as much as the copy: SQLite in WAL mode keeps
recent writes in a separate `-wal` file, so copying just the main
`.sqlite` file without checkpointing first can silently miss recent
transactions.

## HTTPS

The app itself never terminates TLS. In this deployment, HTTPS comes from
Cloudflare in front of an nginx-proxy-manager instance (a separate LXC,
not part of this repo) proxying to this container's plain-HTTP port —
neither of those live in this repo or get provisioned by anything here.

Once that's actually working end to end (confirm first, in that order):

1. Set `PUBLIC_BASE_URL` (e.g. `https://tafeltikker.example.com`) so
   invite links stop embedding the LAN address.
2. Set `COOKIE_SECURE=true` and restart. Turning this on *before*
   confirming HTTPS works silently breaks login — a browser never sends a
   `Secure` cookie over plain HTTP, and there's no error message pointing
   at why.

If you hit `ERR_TOO_MANY_REDIRECTS` after setting this up: check for a
Cloudflare SSL mode ("Flexible") / nginx-proxy-manager "Force SSL" toggle
mismatch — Flexible mode terminates HTTPS at Cloudflare but talks plain
HTTP to the origin, which combined with Force SSL's HTTP→HTTPS redirect
creates a loop. Fix is on Cloudflare/NPM's side, not this app's.

`trustProxy: true` is on by default in `app/src/server.ts` (harmless with
no proxy in front), so `request.ip` reflects the real client once one
exists.
