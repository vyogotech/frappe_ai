# Frappe AI — Installation Guide

End-to-end install and configuration of the Frappe AI app.

## Prerequisites

1. Frappe / ERPNext bench, v16 (the range `pyproject.toml` declares, and the only line CI tests)
2. An AI agent reachable over HTTP that exposes:
   - `POST /api/v1/chat` accepting `{message, session_id, context}` and replying with `text/event-stream` chunks
   - `GET /health` returning 200 when ready
3. Bench CLI installed

## Step 1: Get the app

```bash
cd ~/frappe-bench
bench get-app /path/to/frappe_ai
```

Or from GitHub:

```bash
bench get-app https://github.com/vyogotech/frappe_ai
```

## Step 2: Install on a site

```bash
bench --site your-site.local install-app frappe_ai
bench restart
```

**AI Assistant Settings** is a Single DocType, so Frappe creates the document itself the first time anything reads or saves it. There is nothing to run after the install.

## Step 3: Set the agent URL

The agent URL is read from `site_config.json` — it's intentionally not a doctype field, so it stays per-environment and can't be edited from the desk UI.

Edit `sites/your-site.local/site_config.json`:

```json
{
  "frappe_ai_agent_url": "http://localhost:8484",
  "frappe_ai_agent_url_unsafe_ok": 1
}
```

`frappe_ai_agent_url_unsafe_ok` lets the URL point at a private or loopback address, such as a local agent or one on the same Docker network; leave it out when the agent is on a public address, which must then use https. A cloud metadata or link-local address, or a host that does not resolve, is refused either way.

One more key is optional: `frappe_ai_message_max_chars` caps the length of a question, in characters. It defaults to 10000, and a value that is not a positive integer falls back to that default.

The AI Assistant Settings form shows this value in a read-only **Agent URL** field, refreshed from `site_config` when the form loads and again when it is saved.

### One agent per site

Give every site its own agent and its own MCP server. An agent process holds one `FRAPPE_URL` and writes chat history back to that one site, so pointing two sites at the same agent sends both sites' history to whichever site that agent was configured with. A bench with three sites needs three agents, three MCP servers and three different `frappe_ai_agent_url` values.

The site is therefore the only boundary between one customer's chats and another's. This app stores no tenant identifier on a chat session or message, and it isolates nothing within a site beyond Frappe's own per-user permissions. If a deployment ever has to separate tenants inside one site, that belongs to the platform app that owns the tenant concept, which can add its own `tenant_id` Custom Field and permission query to these DocTypes without a change here.

## Step 4: Enable and tune

Open `/app/ai-assistant-settings` and configure:

| Field | Description | Range |
| --- | --- | --- |
| Enabled | Master switch — APIs throw if false | — |
| Timeout | Seconds the relay waits for the agent between chunks; the job, and the sidebar's own window, allow 30 s more | 1–300 seconds |
| Sidebar Width | Chat sidebar width in pixels | 300–600 |
| Keyboard Shortcut | Toggle combo, e.g. `Alt+/` or `Mod+Shift+A` | See "Reserved shortcuts" below |

### Reserved shortcuts

The settings validator rejects shortcuts that Frappe v16 hard-binds in the desk (the OS still delivers them but Frappe handles them first):

- `Ctrl+/`, `Ctrl+K`, `Ctrl+G`, `Ctrl+S`, `Alt+S`, `Shift+/`

## Step 5: Verify

Click **Test Connection** on the AI Assistant Settings page. It calls `frappe_ai.api.health.test_connection`, which calls `<agent_url>/health` without any credentials.

Then open the desk and click the AI button in the navbar.

## API surface

All endpoints live under `frappe_ai.api.*`. Authentication is the standard Frappe session — APIs `frappe.throw` an `AuthenticationError` for guest users.

| Endpoint | Purpose |
| --- | --- |
| `frappe_ai.api.chat.start_stream` | Enqueue a background worker that relays agent SSE chunks via `frappe.realtime`. Returns `{session_id, currency}`. |
| `frappe_ai.api.chat.cancel_stream` | Flag the caller's own relay for a session to stop between chunks. |
| `frappe_ai.api.chat.get_recent_messages` | Hydrate the sidebar from the user's most recent `AI Chat Session`. Returns `{session_id, messages}`. |
| `frappe_ai.api.confirm.respond` | Record the user's Allow or Deny for a write the agent asked to make. An Allow mints the one-time token. |
| `frappe_ai.api.confirm.redeem` | Spend that token on one write, for the user and the call it was minted for. |
| `frappe_ai.api.health.test_connection` | Settings page health check. System Managers only. |

Two realtime channels carry everything the sidebar receives:

| Event | Published by | Carries |
| --- | --- | --- |
| `frappe_ai:chunk:<session_id>` | the relay worker, `frappe_ai.api.chat` | one agent SSE chunk each, then a `{type: "done"}` marker — or, if the relay failed or timed out, a `{type: "error", message}` as the last event instead |
| `frappe_ai:msg_added` | `frappe_ai.api.realtime.broadcast_message_added`, on every `AI Chat Message` insert | the new message, so a second tab on the same chat appends it without polling |

The browser subscribes to `frappe_ai:chunk:<session_id>` via `frappe.realtime.on` before calling `start_stream`. It generates the session id itself, so it can subscribe before it asks.

## Troubleshooting

### Test Connection fails

- Confirm `frappe_ai_agent_url` is set in `site_config.json` and the bench has been restarted
- Verify the worker host can reach the agent (`curl <agent_url>/health` from the bench machine)
- Check the Error Log doctype for entries titled "AI Agent Connection Test Failed"

### Chat sends but nothing streams back

- The realtime channel is `frappe_ai:chunk:<session_id>` — confirm Frappe's socketio server is running (`bench start` includes it; production uses the `socketio` supervisor process)
- Read the Error Log at `/app/error-log`: SSE failures are logged there under "AI Agent Stream Failed". The worker's own output is in `logs/worker.*.log` under the bench directory (`bench` has no `logs` command)

### Sidebar button doesn't appear

- The bundle is registered in `hooks.py` (`app_include_js` / `app_include_css`). After install, run `bench build --app frappe_ai` and `bench clear-cache`
- Confirm assets resolved by curling `/assets/frappe_ai/dist/js/...` from the site

### "AI Assistant is not enabled"

- The **Enabled** checkbox in AI Assistant Settings is off. Open `/app/ai-assistant-settings`, tick it and save; opening the form is also what creates the Single document on a fresh site.

## Uninstallation

```bash
bench --site your-site.local uninstall-app frappe_ai
bench remove-app frappe_ai
```

This drops the three doctypes (`AI Assistant Settings`, `AI Chat Session`, `AI Chat Message`) and their data. Remove `frappe_ai_agent_url` from `site_config.json` manually if desired.

## Support

- GitHub Issues: <https://github.com/vyogotech/frappe_ai/issues>
