import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import sessionPlugin from "./auth/session.js";
import childRoutes from "./routes/child.js";
import mathRoutes from "./routes/math.js";
import parentRoutes from "./routes/parent.js";
import typingRoutes from "./routes/typing.js";
import adminRoutes from "./routes/admin.js";
import registerRoutes from "./routes/register.js";
import challengesRoutes from "./routes/challenges.js";
import groupRoutes from "./routes/groups.js";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { groups } from "./db/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read at startup (not baked in at build time) so /healthz always reflects
// what THIS running process actually is — comparing it against the
// on-disk package.json after a `git pull` tells you whether a pending
// redeploy still needs `systemctl restart tafeltikker` (see infra/README.md).
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

// Behind a reverse proxy (nginx-proxy-manager, Cloudflare), this makes
// request.ip reflect the real client from X-Forwarded-For instead of the
// proxy's own address. Harmless with no proxy in front (falls back to the
// raw socket address).
const app = Fastify({ logger: true, trustProxy: true });

await app.register(sessionPlugin);
await app.register(fastifyStatic, {
  root: join(__dirname, "..", "public"),
});

// find-my-way ranks routes static > param > wildcard, so an unguarded
// "/:slug" would hijack every existing single-segment static asset
// regardless of registration order — this allowlist re-delegates known
// filenames to the static plugin's own sendFile() and treats anything
// else as a group slug. Verified against the actual public/ directory
// listing (group-invite.html/.js land in a later step, listed here ahead
// of time since this allowlist needs to already know about them).
const RESERVED_TOP_LEVEL_PATHS = new Set([
  "parent.html", "admin.html", "register.html", "group-invite.html",
  "styles.css", "parent.css", "admin.css",
  "app.js", "parent.js", "admin.js", "register.js", "group-invite.js",
  "favicon.ico",
]);
// @fastify/static only auto-serves "/" via its wildcard route, which in
// this find-my-way version ranks *below* the "/:slug" param route below —
// the opposite of exact-static > param > wildcard for every other static
// asset. An explicit exact route for "/" outranks both and restores it.
app.get("/", async (_request, reply) => reply.sendFile("index.html"));
app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
  const { slug } = request.params;
  if (RESERVED_TOP_LEVEL_PATHS.has(slug)) return reply.sendFile(slug);
  if (!/^[a-z0-9_-]+$/.test(slug)) return reply.callNotFound();

  // A real 404 for a slug that isn't a group at all — not just the API
  // underneath returning one while the page itself came back 200 — so a
  // scanner probing random slugs can't tell "no such group" from "real
  // page" by status code alone. Still serves the SPA shell so a genuine
  // user with a stale/mistyped link sees the friendly "niet gevonden"
  // view, just under a 404 status.
  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  if (!group) {
    // no-store, not just the default max-age=0: this status depends on
    // server-side data (does this group exist right now), so a stale
    // cached copy — especially via back/forward-cache navigation, which
    // ignores max-age entirely — must never stand in for a fresh check.
    // cacheControl: false is required — @fastify/send unconditionally
    // sets its own Cache-Control header when serving the file, which
    // would otherwise silently overwrite a plain reply.header() call.
    reply.header("Cache-Control", "no-store");
    return reply.code(404).sendFile("index.html", { cacheControl: false });
  }

  return reply.sendFile("index.html"); // client reads location.pathname itself
});

await app.register(childRoutes);
await app.register(mathRoutes);
await app.register(parentRoutes);
await app.register(typingRoutes);
await app.register(adminRoutes);
await app.register(registerRoutes);
await app.register(challengesRoutes);
await app.register(groupRoutes);

app.get("/healthz", async () => ({ status: "ok", version }));

app
  .listen({ port: PORT, host: HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
