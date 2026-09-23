/**
 * Unlike the other ChartBlock suites this one runs the real echarts, because
 * the text alternative is produced by echarts' own aria visual stage and a
 * mocked `use()` would assert the registration instead of the outcome.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("vue-echarts", () => ({
	default: { name: "VChart", props: ["option"], template: "<div />" },
}));

import { mount } from "@vue/test-utils";
import * as echarts from "echarts/core";
import ChartBlock from "./ChartBlock.vue";
import type { ChartBlock as ChartBlockType } from "../../types/blocks";

// jsdom has no canvas, and zrender measures every label through one
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
	measureText: () => ({ width: 10 }),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

/** Render the block's own option through a real echarts and return its container. */
function render(block: ChartBlockType): HTMLElement {
	const wrapper = mount(ChartBlock, { props: { block } });
	const option = wrapper.findComponent({ name: "VChart" }).props("option");
	const el = document.createElement("div");
	document.body.appendChild(el);
	echarts.init(el, undefined, { renderer: "svg", width: 400, height: 300 }).setOption(option);
	return el;
}

describe("ChartBlock text alternative", () => {
	it("names a bar chart as an image and reads out the series and every point", () => {
		const el = render({
			type: "chart",
			chart_type: "bar",
			title: "Revenue by quarter",
			data: { labels: ["Q1", "Q2"], datasets: [{ name: "Revenue", values: [10, 20] }] },
		});

		expect(el.getAttribute("role")).toBe("img");
		const label = el.getAttribute("aria-label") ?? "";
		expect(label).toContain("Revenue");
		// each category followed by its own value and nothing else numeric: the
		// category index echarts reads out by default would put a "0, " in between
		expect(label).toMatch(/Q1\D*10\b/);
		expect(label).toMatch(/Q2\D*20\b/);
	});

	it("reads a calendar's dates back as dates, not as epoch milliseconds", () => {
		const el = render({
			type: "chart",
			chart_type: "calendar",
			title: "Invoices raised",
			data: {
				labels: ["2026-01-01", "2026-01-02"],
				datasets: [{ name: "Invoices", values: [4, 9] }],
			},
		});

		expect(el.getAttribute("role")).toBe("img");
		const label = el.getAttribute("aria-label") ?? "";
		expect(label).toMatch(/2026-01-01\D*4\b/);
		expect(label).toMatch(/2026-01-02\D*9\b/);
		expect(label).not.toMatch(/\d{10,}/);
	});

	it("reads out pie slices, which carry no on-chart text of their own", () => {
		const el = render({
			type: "chart",
			chart_type: "pie",
			data: { labels: ["Open", "Closed"], datasets: [{ name: "Tickets", values: [3, 7] }] },
		});

		expect(el.getAttribute("role")).toBe("img");
		const label = el.getAttribute("aria-label") ?? "";
		expect(label).toMatch(/Open\D*3\b/);
		expect(label).toMatch(/Closed\D*7\b/);
	});
});
