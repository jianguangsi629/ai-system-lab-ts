/**
 * Simple permission checker for Stage 5.
 * Role-based: actorId -> role -> allowed actions.
 */

import type { PermissionAction, PermissionChecker } from "./types.js";

/** Map role name to list of allowed actions. */
export type RoleActionMap = Record<string, PermissionAction[]>;

/** Map actor id to role name. */
export type ActorRoleMap = Record<string, string>;

/**
 * Create a permission checker from actor->role and role->actions maps.
 * If actor has no role or role has no list, returns false (deny by default).
 */
export function createPermissionChecker(
  actorRoleMap: ActorRoleMap,
  roleActionMap: RoleActionMap
): PermissionChecker {
  return function check(
    actorId: string,
    action: PermissionAction,
    _resource?: string
  ): boolean {
    const role = actorRoleMap[actorId];
    if (!role) return false;
    const actions = roleActionMap[role];
    if (!actions) return false;
    return actions.includes(action);
  };
}

/** Default roles: user can run_agent and run_workflow; admin can do all. */
export const DEFAULT_ROLE_ACTIONS: RoleActionMap = {
  user: ["run_agent", "run_workflow", "approve_tool"],
  admin: [
    "run_agent",
    "run_workflow",
    "approve_tool",
    "view_audit",
    "view_cost",
  ],
};
