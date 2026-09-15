import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { groups, groupAdmins, groupChildren, groupInvites, children, parents, parentChild } from "../db/schema.js";
import { hashSecret, verifySecret, isValidPin } from "../auth/password.js";
import { requireAdmin, requireGroupAdmin, requireParentId } from "../auth/require.js";
import { isGroupTrusted, trustGroup } from "../auth/groupTrust.js";
import { baseUrl } from "./shared.js";
import { assertOwnsChild } from "./parent.js";

const SLUG_PATTERN = /^[a-z0-9_-]+$/;
const DEFAULT_INVITE_EXPIRY_DAYS = 7;

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

// Same usedAt/expiry logic as register.ts's findValidInvite, kept separate
// since it queries a different table (a distinct token space from
// parent_invites).
async function findValidGroupInvite(token: string) {
  const [invite] = await db.select().from(groupInvites).where(eq(groupInvites.token, token));
  if (!invite || invite.usedAt) return null;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return invite;
}

// Word-based, case-insensitive substring match — the design doc is explicit
// that the human "Is dit ... ?" confirmation is the real safety net, not
// algorithmic precision, so this deliberately isn't more clever than this.
function isFuzzyMatch(childName: string, inviteChildName: string): boolean {
  const name = childName.trim().toLowerCase();
  const invite = inviteChildName.trim().toLowerCase();
  if (!name || !invite) return false;
  return name === invite || name.split(/\s+/).includes(invite) || name.includes(invite);
}

async function hasNameCollisionInGroup(groupId: number, name: string, excludeChildId?: number): Promise<boolean> {
  const rows = await db
    .select({ childId: children.id })
    .from(groupChildren)
    .innerJoin(children, eq(children.id, groupChildren.childId))
    .where(and(eq(groupChildren.groupId, groupId), isNull(groupChildren.removedAt), eq(children.name, name)));
  return rows.some((row) => row.childId !== excludeChildId);
}

// A starting suggestion the parent can edit before resubmitting — e.g.
// "Tim Oldemans" -> "Tim O." A single-word name has nothing to abbreviate
// from, so it's returned unchanged and the parent types their own.
function suggestDisambiguatedName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return `${parts[0]} ${parts[1][0]}.`;
  return name;
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

  app.post<{ Params: { id: string }; Body: { childName: string; expiresInDays?: number } }>(
    "/api/admin/groups/:id/invites",
    async (request, reply) => {
      const groupId = Number(request.params.id);
      const admin = await requireGroupAdmin(request, groupId);
      if (!admin) return reply.code(403).send({ error: "forbidden" });

      const { childName, expiresInDays } = request.body ?? {};
      if (!childName?.trim()) return reply.code(400).send({ error: "invalid_request" });

      const expiryDays = Number.isFinite(expiresInDays) && expiresInDays! > 0 ? expiresInDays! : DEFAULT_INVITE_EXPIRY_DAYS;
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

      const [invite] = await db
        .insert(groupInvites)
        .values({ groupId, childName: childName.trim(), token, createdBy: admin.parentId, expiresAt })
        .returning({ token: groupInvites.token, childName: groupInvites.childName, expiresAt: groupInvites.expiresAt });

      return { ...invite, url: `${baseUrl(request)}/group-invite.html?token=${invite.token}` };
    },
  );

  app.get<{ Params: { id: string } }>("/api/admin/groups/:id/invites", async (request, reply) => {
    const groupId = Number(request.params.id);
    const admin = await requireGroupAdmin(request, groupId);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const rows = await db
      .select({
        id: groupInvites.id,
        token: groupInvites.token,
        childName: groupInvites.childName,
        expiresAt: groupInvites.expiresAt,
        usedAt: groupInvites.usedAt,
        usedByUsername: parents.username,
        createdAt: groupInvites.createdAt,
      })
      .from(groupInvites)
      .leftJoin(parents, eq(parents.id, groupInvites.usedBy))
      .where(eq(groupInvites.groupId, groupId))
      .orderBy(desc(groupInvites.createdAt));

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      url: `${baseUrl(request)}/group-invite.html?token=${row.token}`,
      status: row.usedAt ? "used" : new Date(row.expiresAt).getTime() < now ? "expired" : "pending",
    }));
  });

  // Group-scoped roster for the child login screen. GET /api/child/avatars
  // is left completely untouched — the ungrouped single-family case keeps
  // working with zero behavior change; grouped installs use this instead.
  app.get<{ Params: { slug: string } }>("/api/group/:slug/avatars", async (request, reply) => {
    const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.slug, request.params.slug));
    if (!group) return reply.code(404).send({ error: "group_not_found" });

    if (!isGroupTrusted(request, group.id)) {
      return reply.code(401).send({ error: "not_trusted" });
    }

    return { groupName: group.name, avatars: await groupRoster(group.id) };
  });

  async function groupRoster(groupId: number) {
    return db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId })
      .from(groupChildren)
      .innerJoin(children, eq(children.id, groupChildren.childId))
      .where(and(eq(groupChildren.groupId, groupId), isNull(groupChildren.removedAt)))
      .orderBy(children.name);
  }

  app.post<{ Params: { slug: string }; Body: { secret: string; remember?: boolean } }>(
    "/api/group/:slug/secret-login",
    async (request, reply) => {
      const [group] = await db
        .select({ id: groups.id, name: groups.name, secretHash: groups.secretHash })
        .from(groups)
        .where(eq(groups.slug, request.params.slug));
      if (!group) return reply.code(404).send({ error: "group_not_found" });

      const { secret, remember } = request.body ?? {};
      if (!secret || !(await verifySecret(secret, group.secretHash))) {
        return reply.code(401).send({ error: "invalid_secret" });
      }

      if (remember) trustGroup(request, group.id);
      return { groupName: group.name, avatars: await groupRoster(group.id) };
    },
  );

  // Narrower than /api/parent/login: proves "this parent has a child in
  // this group" and (optionally) sets the group-trust cookie, but never
  // touches parentSession — this must never grant dashboard access, per
  // the design doc.
  app.post<{ Params: { slug: string }; Body: { username: string; password: string; remember?: boolean } }>(
    "/api/group/:slug/parent-login",
    async (request, reply) => {
      const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.slug, request.params.slug));
      if (!group) return reply.code(404).send({ error: "group_not_found" });

      const { username, password, remember } = request.body ?? {};
      const [parent] = await db.select().from(parents).where(eq(parents.username, username ?? ""));

      // Identical failure for "wrong password" and "right password, no
      // child in this group" — a wrong guess must never reveal whether a
      // username exists at all.
      if (!parent || !(await verifySecret(password ?? "", parent.passwordHash))) {
        return reply.code(401).send({ error: "no_child_in_group" });
      }

      const [hasChildInGroup] = await db
        .select({ childId: parentChild.childId })
        .from(parentChild)
        .innerJoin(
          groupChildren,
          and(eq(groupChildren.childId, parentChild.childId), eq(groupChildren.groupId, group.id), isNull(groupChildren.removedAt)),
        )
        .where(eq(parentChild.parentId, parent.id));

      if (!hasChildInGroup) {
        return reply.code(401).send({ error: "no_child_in_group" });
      }

      if (remember) trustGroup(request, group.id);
      return { groupName: group.name, avatars: await groupRoster(group.id) };
    },
  );

  app.get<{ Params: { token: string } }>("/api/group-invite/:token", async (request) => {
    const invite = await findValidGroupInvite(request.params.token);
    if (!invite) return { valid: false };

    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, invite.groupId));
    return { valid: true, groupName: group?.name ?? "", childName: invite.childName };
  });

  // Mirrors register.ts's POST /api/register, but validates against
  // groupInvites instead of parentInvites — a separate token space, so
  // that endpoint genuinely can't be reused as-is here. Deliberately does
  // NOT mark the invite used — that only happens once the child is
  // actually linked, in /accept below.
  app.post<{ Params: { token: string }; Body: { username: string; password: string } }>(
    "/api/group-invite/:token/register",
    async (request, reply) => {
      const invite = await findValidGroupInvite(request.params.token);
      if (!invite) return reply.code(400).send({ error: "invalid_invite" });

      const { username, password } = request.body ?? {};
      if (!username?.trim() || !password) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const [existing] = await db.select().from(parents).where(eq(parents.username, username.trim()));
      if (existing) return reply.code(409).send({ error: "username_taken" });

      const [parent] = await db
        .insert(parents)
        .values({ username: username.trim(), passwordHash: await hashSecret(password), role: "parent" })
        .returning({ id: parents.id, username: parents.username, role: parents.role });

      request.parentSession.set("parentId", parent.id);
      return parent;
    },
  );

  app.get<{ Params: { token: string } }>("/api/group-invite/:token/candidates", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const invite = await findValidGroupInvite(request.params.token);
    if (!invite) return reply.code(400).send({ error: "invalid_invite" });

    const myChildren = await db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId })
      .from(children)
      .innerJoin(parentChild, eq(parentChild.childId, children.id))
      .where(eq(parentChild.parentId, parentId))
      .orderBy(children.name);

    const bestMatch = myChildren.find((child) => isFuzzyMatch(child.name, invite.childName)) ?? null;
    const otherChildren = myChildren.filter((child) => child.id !== bestMatch?.id);

    return { bestMatch, otherChildren };
  });

  app.post<{
    Params: { token: string };
    Body: { childId?: number; newChild?: { avatarId: string; pin: string }; displayName?: string };
  }>("/api/group-invite/:token/accept", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const invite = await findValidGroupInvite(request.params.token);
    if (!invite) return reply.code(400).send({ error: "invalid_invite" });

    const { childId, newChild, displayName } = request.body ?? {};

    let resolvedName: string;
    if (childId) {
      if (!(await assertOwnsChild(parentId, childId))) {
        return reply.code(404).send({ error: "child_not_found" });
      }
      const [child] = await db.select({ name: children.name }).from(children).where(eq(children.id, childId));
      if (!child) return reply.code(404).send({ error: "child_not_found" });
      resolvedName = displayName?.trim() || child.name;
    } else if (newChild) {
      if (!newChild.avatarId || !isValidPin(String(newChild.pin ?? ""))) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      resolvedName = displayName?.trim() || invite.childName;
    } else {
      return reply.code(400).send({ error: "invalid_request" });
    }

    // Whichever child is about to be confirmed/created — check against the
    // group's *other current* members, per the design doc's step 5.
    if (await hasNameCollisionInGroup(invite.groupId, resolvedName, childId)) {
      return reply.code(409).send({ error: "name_collision", suggested: suggestDisambiguatedName(resolvedName) });
    }

    let resolvedChildId: number;
    if (childId) {
      resolvedChildId = childId;
      if (displayName?.trim()) {
        await db.update(children).set({ name: displayName.trim() }).where(eq(children.id, childId));
      }
    } else {
      const [created] = await db
        .insert(children)
        .values({ name: resolvedName, avatarId: newChild!.avatarId, pinHash: await hashSecret(newChild!.pin) })
        .returning({ id: children.id });
      resolvedChildId = created.id;
      await db.insert(parentChild).values({ parentId, childId: resolvedChildId });
    }

    // A child who previously left this exact group (parent.ts's soft
    // delete) already has a group_children row at this (groupId, childId)
    // key — a plain insert would collide with its primary key, so this
    // reactivates that row instead of trying to insert a second one.
    await db
      .insert(groupChildren)
      .values({ groupId: invite.groupId, childId: resolvedChildId })
      .onConflictDoUpdate({ target: [groupChildren.groupId, groupChildren.childId], set: { removedAt: null } });

    await db
      .update(groupInvites)
      .set({ usedBy: parentId, usedAt: new Date().toISOString() })
      .where(eq(groupInvites.id, invite.id));

    // Finishing an invite proves membership more thoroughly than either
    // gate path — auto-trusting the device avoids immediately re-gating
    // the parent right after they just finished setup.
    trustGroup(request, invite.groupId);

    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, invite.groupId));
    return { groupName: group?.name ?? "", childName: resolvedName };
  });
}
