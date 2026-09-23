# Frappe AI

[![CI](https://github.com/vyogotech/frappe_ai/actions/workflows/ci.yml/badge.svg)](https://github.com/vyogotech/frappe_ai/actions/workflows/ci.yml)

An in-desk AI assistant for Frappe/ERPNext. Streams responses from a configured AI agent over HTTP and renders markdown prose plus structured KPI / chart / table blocks in a chat sidebar.

## Features

- Chat sidebar embedded in the Frappe desk, toggled from the navbar or a custom keyboard shortcut
- Streamed responses relayed through `frappe.realtime` (no separate SSE proxy in the browser)
- Per-user conversation history persisted as `AI Chat Session` / `AI Chat Message` doctypes
- Page-context forwarding: the agent sees the user's current route / doctype / docname for grounded answers
- Authentication via the user's existing `sid` cookie — no extra OAuth client to provision

## Installation

```bash
bench get-app https://github.com/vyogotech/frappe_ai
bench --site your-site install-app frappe_ai
bench restart
```

Then set the agent URL in `sites/your-site/site_config.json`:

```json
{
  "frappe_ai_agent_url": "http://localhost:8484",
  "frappe_ai_agent_url_unsafe_ok": 1
}
```

And open `/app/ai-assistant-settings` to toggle **Enabled**.

See [QUICKSTART.md](QUICKSTART.md) for a 5-minute walkthrough or [INSTALLATION.md](INSTALLATION.md) for the full guide.

## Usage

Click the AI button in the navbar (or press your configured shortcut) and type a query. Examples:

- "Show me all open projects"
- "What are the top customers by revenue?"
- "List pending sales orders"

## Configuration

| Where | Key | Purpose |
| --- | --- | --- |
| `site_config.json` | `frappe_ai_agent_url` | Agent endpoint (authoritative) |
| `site_config.json` | `frappe_ai_agent_url_unsafe_ok` | Accept a private or loopback agent address. Without it the URL must be public and https |
| `site_config.json` | `frappe_ai_message_max_chars` | Longest question accepted, in characters (default 10000) |
| AI Assistant Settings | `enabled` | Master switch |
| AI Assistant Settings | `timeout` | Seconds the relay waits for the agent between chunks (1–300s) |
| AI Assistant Settings | `sidebar_width` | Sidebar width in px (300–600) |
| AI Assistant Settings | `keyboard_shortcut` | Toggle combo (e.g. `Alt+/`) |

## Linting and formatting

`npm run lint` runs ESLint 9 from `eslint.config.mjs`: `eslint-plugin-vue`'s `flat/recommended` for Vue 3,
`typescript-eslint`, and `eslint-plugin-vuejs-accessibility`, with `no-console`, `no-empty`, `vue/no-v-html`
and the accessibility rules raised to errors. `eslint-config-prettier` is last in the config, so every layout
rule is off and ESLint reports only findings.

`npm run format:check` runs Prettier 3 over the JavaScript, TypeScript, Vue and CSS (`npm run format` writes).
Prettier's defaults apply except for three values taken from `.editorconfig`, which the repo already had:
tabs, width 4, 99 columns. Tabs, not Prettier's spaces, because `.editorconfig` is the repo's own declaration,
it is what `ruff format` (`indent-style = "tab"`) already enforces for the Python half, and it is Frappe's
house style; the `.ts` and `.css` files had drifted to spaces only because nothing was checking them.
`.prettierignore` keeps Prettier to the languages `.pre-commit-config.yaml` already gave it — Markdown stays
with markdownlint, and the DocType JSON stays with Frappe, which regenerates it.

`make lint` runs both alongside ruff; `make typecheck` runs pyrefly and `tsc`. CI calls the same targets.

What the first ESLint run caught, and what was done about it:

| Finding | Where | Fix |
| --- | --- | --- |
| `no-console` | `composables/useChat.ts` | Dropped: the `catch` already documents that a failed history restore is best-effort, and the desk has no browser-side logger to route it to. |
| `no-console` | `components/MessageBubble.vue` | Dropped: `onErrorCaptured` already sets `renderError`, which renders "Could not render response" in the bubble. |
| `vue/no-v-html` | `MessageBubble.vue` ×2, `ToolCallCard.vue` | Kept, with the disable comment moved onto the line the rule reports. The comments sat above a multi-line opening tag, three lines from the `v-html` attribute, so they silenced nothing. Each now carries its reason: markdown-it runs with `html: false`, and `frappeIcon` returns the desk's own `<svg><use>` markup. |
| `vuejs-accessibility/click-events-have-key-events`, `no-static-element-interactions` | `App.vue` | The click-to-dismiss overlay is `aria-hidden="true"`. It is a decorative scrim; the header's labelled Close button is the accessible way out. |
| `vuejs-accessibility/click-events-have-key-events`, `no-static-element-interactions` | `blocks/StatusList.vue` | A row that carries a route now gets `role="button"`, `tabindex="0"` and Enter/Space handlers. The role is bound rather than static — a row without a route is not interactive — which the rule cannot evaluate, so that one site carries a disable comment saying so. |
| `@typescript-eslint/no-unused-vars` | `App.vue`, `blocks/KPICards.vue`, `blocks/StatusList.vue` | `const props = defineProps(...)` where nothing read `props`; the templates read the prop names directly. Now plain `defineProps(...)`. |
| `@typescript-eslint/no-unused-vars` | `composables/useChat.ts` | `_activeEventName` was written in three places and never read. Removed. |
| `no-undef` | `ai_assistant_settings.js` | Not a code change: the desk client script's `frappe` and `__` globals are declared in `eslint.config.mjs`. |

## License

MIT
