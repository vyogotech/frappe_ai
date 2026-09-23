# Frappe AI — Installation Guide

End-to-end install and configuration of the Frappe AI app.

## Prerequisites

1. Frappe / ERPNext bench (v15 or higher)
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

`install.py:after_install` creates the **AI Assistant Settings** singleton on first install. The same logic runs in `after_migrate` so the singleton survives migrations.

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

The AI Assistant Settings form shows this value in a read-only **Agent URL** field; the `before_save` hook refreshes it from `site_config` on every save.

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
| `frappe_ai.api.chat.start_stream` | Enqueue a background worker that relays agent SSE chunks via `frappe.realtime`. Returns `{session_id}`. |
| `frappe_ai.api.chat.get_recent_messages` | Hydrate the sidebar from the user's most recent `AI Chat Session`. Returns `{session_id, messages}`. |
| `frappe_ai.api.health.test_connection` | Settings page health check. |

The browser subscribes to `frappe_ai:chunk:<session_id>` via `frappe.realtime.on` before calling `start_stream`. The worker then publishes each agent SSE chunk to that channel and finally emits a `{type: "done"}` marker.

## Troubleshooting

### Test Connection fails

- Confirm `frappe_ai_agent_url` is set in `site_config.json` and the bench has been restarted
- Verify the worker host can reach the agent (`curl <agent_url>/health` from the bench machine)
- Check the Error Log doctype for entries titled "AI Agent Connection Test Failed"

### Chat sends but nothing streams back

- The realtime channel is `frappe_ai:chunk:<session_id>` — confirm Frappe's socketio server is running (`bench start` includes it; production uses the `socketio` supervisor process)
- Check `bench logs` for the long-queue worker; SSE failures get logged as "AI Agent Stream Failed"

### Sidebar button doesn't appear

- The bundle is registered in `hooks.py` (`app_include_js` / `app_include_css`). After install, run `bench build --app frappe_ai` and `bench clear-cache`
- Confirm assets resolved by curling `/assets/frappe_ai/dist/js/...` from the site

### "AI Assistant is not enabled"

- The **Enabled** checkbox in AI Assistant Settings is off, or the singleton hasn't been created. Re-run `bench --site your-site migrate` to trigger `after_migrate`.

## Uninstallation

```bash
bench --site your-site.local uninstall-app frappe_ai
bench remove-app frappe_ai
```

This drops the three doctypes (`AI Assistant Settings`, `AI Chat Session`, `AI Chat Message`) and their data. Remove `frappe_ai_agent_url` from `site_config.json` manually if desired.

## Support

- GitHub Issues: <https://github.com/vyogotech/frappe_ai/issues>
