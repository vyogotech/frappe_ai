/**
 * Pure-function decision for what the bundle's bootstrap should render
 * given the current settings + user roles.
 *
 * OBS-015: when AI Assistant Settings.enabled is false, the bundle used
 * to return early and inject nothing — leaving a System Manager with no
 * UI hint that they could re-enable it. This helper surfaces a separate
 * "show-disabled-hint" state for System Managers so the bundle can
 * inject a small link back to `/app/ai-assistant-settings`.
 *
 * Regular users still see nothing — they can't enable it anyway, so a
 * dead link would be confusing.
 */

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
