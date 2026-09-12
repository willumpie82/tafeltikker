import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import sessionPlugin from "./auth/session.js";
import childRoutes from "./routes/child.js";
import mathRoutes from "./routes/math.js";
import parentRoutes from "./routes/parent.js";
import typingRoutes from "./routes/typing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(sessionPlugin);
await app.register(fastifyStatic, {
  root: join(__dirname, "..", "public"),
});
await app.register(childRoutes);
await app.register(mathRoutes);
await app.register(parentRoutes);
await app.register(typingRoutes);

app.get("/healthz", async () => ({ status: "ok" }));

app
  .listen({ port: PORT, host: HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
