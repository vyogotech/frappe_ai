/** ADR-006: a write pauses the chat, and the card is what the user answers it with. */

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ToolCallCard from "./ToolCallCard.vue";
import type { ToolCall } from "../types/messages";

function pending(overrides: Partial<ToolCall> = {}): ToolCall {
	return {
		call_id: "c1",
		name: "create_document",
		arguments: { doctype: "ToDo", description: "pay the invoice" },
		status: "waiting",
		confirm: { id: "abc123" },
		timestamp: new Date("2026-01-01T12:00:00Z"),
		...overrides,
	};
}

describe("ToolCallCard, waiting on the user", () => {
	it("asks with Open WebUI's line and offers Allow and Deny", () => {
		const wrapper = mount(ToolCallCard, { props: { toolCall: pending() } });
		expect(wrapper.text()).toContain("Allow create_document?");
		const buttons = wrapper.findAll(".frappe-ai-tool-actions button").map((b) => b.text());
		expect(buttons).toEqual(["Allow", "Deny"]);
	});

	it("emits the confirmation id, not the tool name, on each click", async () => {
		const wrapper = mount(ToolCallCard, { props: { toolCall: pending() } });
		const [allow, deny] = wrapper.findAll(".frappe-ai-tool-actions button");
		await allow.trigger("click");
		await deny.trigger("click");
		expect(wrapper.emitted("allow")).toEqual([["abc123"]]);
		expect(wrapper.emitted("deny")).toEqual([["abc123"]]);
	});

	it("shows the arguments under Open WebUI's Input heading", async () => {
		const wrapper = mount(ToolCallCard, { props: { toolCall: pending() } });
		await wrapper.find(".frappe-ai-tool-toggle").trigger("click");
		expect(wrapper.find(".frappe-ai-tool-label").text()).toBe("Input");
		expect(wrapper.find("pre.frappe-ai-tool-pre").text()).toContain('"ToDo"');
	});

	it("reads Denied after the answer and offers nothing more to click", () => {
		const wrapper = mount(ToolCallCard, {
			props: { toolCall: pending({ status: "cancelled" }) },
		});
		expect(wrapper.text()).toContain("Denied create_document");
		expect(wrapper.find(".frappe-ai-tool-actions").exists()).toBe(false);
	});

	it("leaves an ordinary tool card alone", () => {
		const wrapper = mount(ToolCallCard, {
			props: { toolCall: pending({ status: "done", confirm: undefined }) },
		});
		expect(wrapper.find("button.frappe-ai-tool-header").exists()).toBe(true);
		expect(wrapper.find(".frappe-ai-tool-actions").exists()).toBe(false);
		expect(wrapper.text()).not.toContain("Allow");
	});
});
