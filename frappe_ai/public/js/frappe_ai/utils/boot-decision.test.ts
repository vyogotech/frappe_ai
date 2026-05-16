import { describe, it, expect } from "vitest";
import { decideBoot } from "./boot-decision";

describe("decideBoot", () => {
  it("mounts the sidebar when enabled", () => {
    expect(decideBoot({ enabled: true, roles: ["All"] })).toBe("mount-sidebar");
  });

  it("renders nothing when disabled and user is not a System Manager", () => {
    expect(decideBoot({ enabled: false, roles: ["All", "Desk User"] })).toBe("hidden");
  });

  it("renders the disabled-hint when disabled and user IS a System Manager", () => {
    // OBS-015: System Managers need an in-UI nudge back to settings.
    expect(decideBoot({ enabled: false, roles: ["All", "System Manager"] })).toBe(
      "show-disabled-hint",
    );
  });

  it("Administrator is treated like System Manager (always has all roles)", () => {
    expect(decideBoot({ enabled: false, roles: ["Administrator"] })).toBe("show-disabled-hint");
  });

  it("empty role list with disabled = hidden", () => {
    expect(decideBoot({ enabled: false, roles: [] })).toBe("hidden");
  });
});
