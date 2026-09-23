import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import TableBlock from "./TableBlock.vue";

const g = globalThis as Record<string, unknown>;

const BLOCK = {
	type: "table",
	title: "Customers",
	columns: [
		{ key: "name", label: "Name" },
		{ key: "revenue", label: "Revenue" },
	],
	rows: [
		{ values: { name: "Acme", revenue: 1000 }, route: { doctype: "Customer", name: "Acme" } },
		{ values: { name: "Globex", revenue: 500 } },
	],
};

function render() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return mount(TableBlock, { props: { block: BLOCK as any } });
}

describe("TableBlock without a mouse", () => {
	let originalFrappe: unknown;
	let setRoute: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalFrappe = g.frappe;
		setRoute = vi.fn();
		const stub = g.frappe as Record<string, unknown>;
		g.frappe = {
			...stub,
			set_route: setRoute,
			utils: {
				...(stub.utils as Record<string, unknown>),
				get_form_link: (doctype: string, name: string) =>
					`/desk/${doctype.toLowerCase()}/${name}`,
			},
		};
	});

	afterEach(() => {
		g.frappe = originalFrappe;
	});

	it("puts the sort control in a button, so a key can reach it", async () => {
		const wrapper = render();
		const buttons = wrapper.findAll("thead th button");
		expect(buttons).toHaveLength(2);
		expect(buttons[0].attributes("type")).toBe("button");
		await buttons[0].trigger("click");
		expect(wrapper.html()).toContain("↑");
	});

	it("says which column is sorted and which way", async () => {
		const wrapper = render();
		const headers = () => wrapper.findAll("thead th");
		expect(headers()[0].attributes("aria-sort")).toBeUndefined();
		await headers()[0].find("button").trigger("click");
		expect(headers()[0].attributes("aria-sort")).toBe("ascending");
		expect(headers()[1].attributes("aria-sort")).toBeUndefined();
		await headers()[0].find("button").trigger("click");
		expect(headers()[0].attributes("aria-sort")).toBe("descending");
		// the arrow repeats what aria-sort already says
		expect(headers()[0].find("span").attributes("aria-hidden")).toBe("true");
	});

	it("makes a routed row reachable as a link to its form", async () => {
		const wrapper = render();
		const links = wrapper.findAll("tbody a");
		expect(links).toHaveLength(1);
		expect(links[0].attributes("href")).toBe("/desk/customer/Acme");
		expect(links[0].text()).toBe("Acme");
		await links[0].trigger("click");
		expect(setRoute).toHaveBeenCalledTimes(1);
		expect(setRoute).toHaveBeenCalledWith("Form", "Customer", "Acme");
	});

	it("leaves a row with no route as plain cells", () => {
		const wrapper = render();
		const rows = wrapper.findAll("tbody tr");
		expect(rows[1].findAll("a")).toHaveLength(0);
		expect(rows[1].text()).toContain("Globex");
	});

	it("still navigates on a click anywhere else in the row", async () => {
		const wrapper = render();
		await wrapper.findAll("tbody tr")[0].trigger("click");
		expect(setRoute).toHaveBeenCalledTimes(1);
	});
});
