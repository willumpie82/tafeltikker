import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));

app
  .listen({ port: PORT, host: HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
