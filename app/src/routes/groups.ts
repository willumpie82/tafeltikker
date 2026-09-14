import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { groups, groupAdmins, groupChildren, children } from "../db/schema.js";
import { hashSecret } from "../auth/password.js";
import { requireAdmin, requireGroupAdmin } from "../auth/require.js";

const SLUG_PATTERN = /^[a-z0-9_-]+$/;

// Excludes 0/O/1/l/I — this is handwritten on a whiteboard or read aloud to
// a class, not pasted as a URL token, so avoiding ambiguous characters
// matters more here than it does for the base64url invite tokens elsewhere.
const KLAS_GEHEIM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const KLAS_GEHEIM_LENGTH = 8;

function generateKlasGeheim(): string {
  const bytes = randomBytes(KLAS_GEHEIM_LENGTH);
  let secret = "";
  for (const byte of bytes) secret += KLAS_GEHEIM_ALPHABET[byte % KLAS_GEHEIM_ALPHABET.length];
  return secret;
}

export default async function groupRoutes(app: FastifyInstance) {
  // Site admins only — per the design doc, group admins don't create
  // groups, they're granted admin of one at creation time.
  app.post<{ Body: { name: string; slug: string } }>("/api/admin/groups", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const { name, slug } = request.body ?? {};
    if (!name?.trim() || !slug || !SLUG_PATTERN.test(slug)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
    if (existing) return reply.code(409).send({ error: "slug_taken" });

    const secret = generateKlasGeheim();
    const [group] = await db
      .insert(groups)
      .values({ slug, name: name.trim(), secretHash: await hashSecret(secret) })
      .returning({ id: groups.id, slug: groups.slug, name: groups.name });

    await db.insert(groupAdmins).values({ groupId: group.id, parentId: admin.parentId });

    // The only response that ever contains the plaintext secret.
    return { ...group, secret };
  });

  app.get("/api/admin/groups", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    return db
      .select({
        id: groups.id,
        slug: groups.slug,
        name: groups.name,
        createdAt: groups.createdAt,
        // Derived via join/count, never stored; only counts current
        // members (a parent-removed row keeps its group_children row for
        // the admin roster view, so it must not inflate this count).
        memberCount: sql<number>`count(${groupChildren.childId})`,
      })
      .from(groups)
      .leftJoin(groupChildren, and(eq(groupChildren.groupId, groups.id), isNull(groupChildren.removedAt)))
      .groupBy(groups.id)
      .orderBy(groups.name);
  });

  app.get<{ Params: { slug: string } }>("/api/admin/groups/:slug/roster", async (request, reply) => {
    const [group] = await db
      .select({ id: groups.id, slug: groups.slug, name: groups.name })
      .from(groups)
      .where(eq(groups.slug, request.params.slug));
    if (!group) return reply.code(404).send({ error: "group_not_found" });

    const admin = await requireGroupAdmin(request, group.id);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    // Includes parent-removed rows (removedAt set) alongside current
    // members — the admin UI distinguishes them by that field rather than
    // this endpoint filtering them out.
    const roster = await db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId, removedAt: groupChildren.removedAt })
      .from(groupChildren)
      .innerJoin(children, eq(children.id, groupChildren.childId))
      .where(eq(groupChildren.groupId, group.id))
      .orderBy(children.name);

    return { group, roster };
  });

  app.post<{ Params: { id: string } }>("/api/admin/groups/:id/regenerate-secret", async (request, reply) => {
    const groupId = Number(request.params.id);
    const admin = await requireGroupAdmin(request, groupId);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const secret = generateKlasGeheim();
    const [updated] = await db
      .update(groups)
      .set({ secretHash: await hashSecret(secret) })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    if (!updated) return reply.code(404).send({ error: "group_not_found" });

    return { secret };
  });

  // "Remove from roster": deletes the group_children row only, never the
  // child itself — distinct from a parent's own leave-a-group action
  // (parent.ts), which soft-deletes instead so the admin view can tell the
  // two apart.
  app.delete<{ Params: { groupId: string; childId: string } }>(
    "/api/admin/groups/:groupId/children/:childId",
    async (request, reply) => {
      const groupId = Number(request.params.groupId);
      const admin = await requireGroupAdmin(request, groupId);
      if (!admin) return reply.code(403).send({ error: "forbidden" });

      await db
        .delete(groupChildren)
        .where(and(eq(groupChildren.groupId, groupId), eq(groupChildren.childId, Number(request.params.childId))));

      return { ok: true };
    },
  );
}
