import type { FastifyRequest } from "fastify";

export function requireChildId(request: FastifyRequest): number | undefined {
  return request.childSession.get("childId");
}

export function requireParentId(request: FastifyRequest): number | undefined {
  return request.parentSession.get("parentId");
}
