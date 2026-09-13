import { randomBytes } from "node:crypto";
import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";
import type { Session } from "@fastify/secure-session";
import type { FastifyInstance } from "fastify";

export type ChildSessionData = { childId: number };
export type ParentSessionData = { parentId: number };

declare module "fastify" {
  interface FastifyRequest {
    childSession: Session<ChildSessionData>;
    parentSession: Session<ParentSessionData>;
  }
}

function resolveKey(envVar: string): Buffer {
  const value = process.env[envVar];
  if (value) {
    return Buffer.from(value, "hex");
  }
  console.warn(
    `[auth] ${envVar} not set, generating an ephemeral key for this run only ` +
      "(fine for local dev; sessions won't survive a restart). Set it explicitly in production.",
  );
  return randomBytes(32);
}

// Off by default so the app still works over plain HTTP (LAN access, or
// before a reverse proxy is wired up) — a secure-only cookie is silently
// never sent over http, which would look exactly like being logged out.
// Set once TLS is actually terminating in front of this instance (e.g. by
// Cloudflare/nginx-proxy-manager) and confirmed working.
const cookieSecure = process.env.COOKIE_SECURE === "true";

export default fp(async function sessionPlugin(app: FastifyInstance) {
  await app.register(secureSession, [
    {
      sessionName: "childSession",
      cookieName: "child_session",
      key: resolveKey("CHILD_SESSION_KEY"),
      expiry: 2 * 60 * 60, // 2 hours
      cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: cookieSecure },
    },
    {
      sessionName: "parentSession",
      cookieName: "parent_session",
      key: resolveKey("PARENT_SESSION_KEY"),
      expiry: 12 * 60 * 60, // 12 hours
      cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: cookieSecure },
    },
  ]);
});
