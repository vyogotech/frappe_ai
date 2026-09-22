/** What the bootstrap renders: the sidebar, else a settings link for whoever can enable AI, else nothing. */

export type BootDecision = "mount-sidebar" | "show-disabled-hint" | "hidden";

const PRIVILEGED_ROLES = new Set(["System Manager", "Administrator"]);

export interface BootDecisionInput {
  enabled: boolean;
  roles: string[];
}

export function decideBoot(input: BootDecisionInput): BootDecision {
  if (input.enabled) return "mount-sidebar";
  const hasPrivilegedRole = (input.roles || []).some((r) => PRIVILEGED_ROLES.has(r));
  return hasPrivilegedRole ? "show-disabled-hint" : "hidden";
}
