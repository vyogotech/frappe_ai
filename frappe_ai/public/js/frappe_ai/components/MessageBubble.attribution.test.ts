import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBubble from "./MessageBubble.vue";
import type { Message } from "../types/messages";

const stamp = new Date("2026-01-01T10:00:00Z");

function bubble(message: Message) {
	return mount(MessageBubble, { props: { message } });
}

describe("MessageBubble attribution", () => {
	it("says who is speaking, which alignment and colour say only to a sighted user", () => {
		const user = bubble({ id: "1", role: "user", content: "hello", timestamp: stamp });
		expect(user.find(".frappe-ai-sr-only").text()).toBe("You said:");

		const assistant = bubble({
			id: "2",
			role: "assistant",
			content: "hi",
			pending: false,
			timestamp: stamp,
		});
		expect(assistant.find(".frappe-ai-sr-only").text()).toBe("Frappe AI said:");
	});

	it("leaves an error bubble unattributed, because neither party said it", () => {
		const err = bubble({
			id: "3",
			role: "error",
			content: "",
			error: { code: "BOOM", message: "something broke" },
			timestamp: stamp,
		});
		expect(err.find(".frappe-ai-sr-only").exists()).toBe(false);
	});

	it("keeps the attribution out of sight: the class clips it", () => {
		// vitest runs with the repo root as its cwd (vitest.config.ts sits there)
		const css = readFileSync("frappe_ai/public/css/frappe_ai_sidebar.bundle.css", "utf8");
		const rule = css.match(/\.frappe-ai-sr-only\s*\{[^}]*\}/)?.[0] ?? "";
		expect(rule).toContain("position: absolute");
		expect(rule).toContain("clip-path: inset(50%)");
		expect(rule).toContain("width: 1px");
	});
});
