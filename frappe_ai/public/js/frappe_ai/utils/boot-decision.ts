/** What the bootstrap renders: the sidebar, else a settings link for whoever can enable AI, else nothing. */

export type BootDecision = "mount-sidebar" | "show-disabled-hint" | "hidden";

const PRIVILEGED_ROLES = new Set(["System Manager", "Administrator"]);

export interface BootDecisionInput {
	enabled: boolean;
	roles: string[];
	/** The desk boot carried no settings, so `enabled` is unknown rather than false. */
	loadError?: boolean;
}

export function decideBoot(input: BootDecisionInput): BootDecision {
	// settings that never arrived are not an administrator's switch: mount with the defaults rather than report it off
	if (input.enabled || input.loadError) return "mount-sidebar";
	const hasPrivilegedRole = (input.roles || []).some((r) => PRIVILEGED_ROLES.has(r));
	return hasPrivilegedRole ? "show-disabled-hint" : "hidden";
}
