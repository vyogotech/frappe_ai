import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ToolCallCard from "./ToolCallCard.vue";
import type { ToolCall } from "../types/messages";

function card(toolCall: Partial<ToolCall> = {}) {
	return mount(ToolCallCard, {
		props: {
			toolCall: {
				call_id: "c1",
				name: "get_doc",
				arguments: {},
				status: "done",
				...toolCall,
			} as ToolCall,
		},
	});
}

describe("ToolCallCard accessible names", () => {
	it("keeps the header's name steady while aria-expanded carries the state", async () => {
		const wrapper = card();
		const header = wrapper.get("button.frappe-ai-tool-header");
		expect(header.attributes("aria-expanded")).toBe("false");
		expect(header.attributes("aria-label")).toBe("Tool call: get_doc");

		await header.trigger("click");
		expect(header.attributes("aria-expanded")).toBe("true");
		expect(header.attributes("aria-label")).toBe("Tool call: get_doc");
	});

	it("keeps the result toggle's name steady too", async () => {
		const wrapper = card({ result: "42" });
		await wrapper.get("button.frappe-ai-tool-header").trigger("click");
		const toggle = wrapper.get("button.frappe-ai-tool-expand-btn");
		expect(toggle.attributes("aria-expanded")).toBe("false");
		expect(toggle.attributes("aria-label")).toBe("Tool result");

		await toggle.trigger("click");
		expect(toggle.attributes("aria-expanded")).toBe("true");
		expect(toggle.attributes("aria-label")).toBe("Tool result");
	});

	it("lets the confirm header's own visible label be its name", async () => {
		const wrapper = card({ status: "waiting", confirm: { id: "x1" } });
		const header = wrapper.get("button.frappe-ai-tool-toggle");
		expect(header.attributes("aria-label")).toBeUndefined();
		expect(header.text()).toContain("Allow get_doc?");

		await header.trigger("click");
		expect(header.attributes("aria-expanded")).toBe("true");
		expect(header.text()).toContain("Allow get_doc?");
	});
});
