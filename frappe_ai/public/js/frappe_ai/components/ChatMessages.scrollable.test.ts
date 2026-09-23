/**
 * WCAG 2.2 SC 2.1.1: while the list scrolls it needs a tab stop of its own, or what is above the fold
 * is pointer-only — axe's scrollable-region-focusable. The stop has to come and go with that
 * condition, or it is a stop the desk did not have at any other size.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ChatMessages from "./ChatMessages.vue";

let onResize: (() => void) | undefined;

class StubResizeObserver {
	constructor(cb: () => void) {
		onResize = cb;
	}
	observe() {}
	unobserve() {}
	disconnect() {
		onResize = undefined;
	}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", StubResizeObserver));
afterEach(() => vi.unstubAllGlobals());

/** jsdom lays nothing out, so the two heights the component measures are set by hand. */
async function panel(scrollHeight: number, clientHeight: number) {
	const wrapper = mount(ChatMessages, { props: { messages: [] } });
	resize(wrapper.find(".frappe-ai-messages").element as HTMLElement, scrollHeight, clientHeight);
	await nextTick();
	return wrapper;
}

function resize(el: HTMLElement, scrollHeight: number, clientHeight: number) {
	Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
	Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
	onResize?.();
}

describe("ChatMessages keyboard access to the scrolling list", () => {
	it("takes no tab stop when the list fits", async () => {
		const el = (await panel(400, 400)).find(".frappe-ai-messages");
		expect(el.attributes("tabindex")).toBeUndefined();
		expect(el.attributes("aria-label")).toBeUndefined();
	});

	it("takes one, named, when it scrolls", async () => {
		const el = (await panel(348, 149)).find(".frappe-ai-messages");
		expect(el.attributes("tabindex")).toBe("0");
		expect(el.attributes("aria-label")).toBe("Chat messages");
	});

	it("gives the stop up again when the list stops scrolling", async () => {
		const wrapper = await panel(348, 149);
		expect(wrapper.find(".frappe-ai-messages").attributes("tabindex")).toBe("0");

		resize(wrapper.find(".frappe-ai-messages").element as HTMLElement, 348, 348);
		await nextTick();

		expect(wrapper.find(".frappe-ai-messages").attributes("tabindex")).toBeUndefined();
	});

	it("stops measuring once unmounted", async () => {
		(await panel(400, 400)).unmount();
		expect(onResize).toBeUndefined();
	});
});
