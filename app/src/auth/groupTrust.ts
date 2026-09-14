import type { FastifyRequest } from "fastify";

export function isGroupTrusted(request: FastifyRequest, groupId: number): boolean {
  const trustedGroupIds = request.groupTrust.get("trustedGroupIds") ?? [];
  return trustedGroupIds.includes(groupId);
}

/**
 * `.set()` replaces the whole session value, so this reads the current list
 * before writing — otherwise trusting a new group would clobber every
 * group already trusted on this device.
 */
export function trustGroup(request: FastifyRequest, groupId: number): void {
  const trustedGroupIds = request.groupTrust.get("trustedGroupIds") ?? [];
  if (trustedGroupIds.includes(groupId)) return;
  request.groupTrust.set("trustedGroupIds", [...trustedGroupIds, groupId]);
}
