# Frappe AI

An in-desk AI assistant for Frappe/ERPNext. Streams responses from a configured AI agent over HTTP and renders markdown prose plus structured KPI / chart / table blocks in a chat sidebar.

## Features

- Chat sidebar embedded in the Frappe desk, toggled from the navbar or a custom keyboard shortcut
- Streamed responses relayed through `frappe.realtime` (no separate SSE proxy in the browser)
- Per-user conversation history persisted as `AI Chat Session` / `AI Chat Message` doctypes
- Page-context forwarding: the agent sees the user's current route / doctype / docname for grounded answers
- Authentication via the user's existing `sid` cookie — no extra OAuth client to provision

## Installation

```bash
bench get-app https://github.com/Vyogo/frappe_ai
bench --site your-site install-app frappe_ai
bench restart
```

Then set the agent URL in `sites/your-site/site_config.json`:

```json
{
  "frappe_ai_agent_url": "http://localhost:8484"
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
| AI Assistant Settings | `enabled` | Master switch |
| AI Assistant Settings | `timeout` | Per-request timeout (1–300s) |
| AI Assistant Settings | `sidebar_width` | Sidebar width in px (300–600) |
| AI Assistant Settings | `keyboard_shortcut` | Toggle combo (e.g. `Alt+/`) |

## License

MIT
