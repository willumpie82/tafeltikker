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
await app.register(childRoutes);
await app.register(mathRoutes);
await app.register(parentRoutes);
await app.register(typingRoutes);
await app.register(adminRoutes);
await app.register(registerRoutes);
await app.register(challengesRoutes);

app.get("/healthz", async () => ({ status: "ok", version }));

app
  .listen({ port: PORT, host: HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
