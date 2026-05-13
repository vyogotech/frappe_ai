# Frappe AI — Quick Start

Up and running in 5 minutes.

## 1. Install the app

```bash
cd ~/frappe-bench
bench get-app /path/to/frappe_ai   # or the GitHub URL
bench --site your-site.local install-app frappe_ai
bench restart
```

## 2. Point at your AI agent

Edit `sites/your-site.local/site_config.json`:

```json
{
  "frappe_ai_agent_url": "http://localhost:8484"
}
```

This URL must be reachable from the worker process — the backend POSTs to `<agent_url>/api/v1/chat` and relays the SSE stream to the browser via `frappe.realtime`.

## 3. Enable the assistant

1. Open `/app/ai-assistant-settings`
2. Check **Enabled**
3. (Optional) set a `keyboard_shortcut` like `Alt+/`
4. Click **Save**, then **Test Connection** to confirm the agent is reachable

## 4. Try it

Click the AI button in the navbar (or press your shortcut) and ask:

- "Show me all open projects"
- "List customers with revenue > 100000"
- "What are pending sales orders?"

## Troubleshooting

### Sidebar button doesn't appear

```bash
bench clear-cache
bench build --app frappe_ai
bench restart
```

### Test Connection fails

- Verify `frappe_ai_agent_url` in `site_config.json` (no trailing slash needed — it's stripped)
- Confirm the agent's `/health` endpoint returns 200
- Check the worker process can reach the agent host (not just your laptop)

### Streaming hangs / times out

- Bump `timeout` in AI Assistant Settings (max 300s)
- Inspect `bench logs` — the long-queue worker logs request failures to the Error Log

## Architecture overview

```text
┌──────────┐   sid cookie    ┌────────────────┐
│  Browser │ ──────────────▶ │ Frappe backend │
└────▲─────┘                 │  chat.py       │
     │ realtime              └────┬───────────┘
     │ frappe_ai:chunk:<sid>      │ enqueue (long queue)
     │                            ▼
     │                    ┌────────────────┐
     └────────────────────│ Background     │  POST /api/v1/chat
                          │ worker         │  (sid forwarded)
                          │ _stream_to_    │ ───────▶  AI agent
                          │ agent          │ ◀───────  SSE chunks
                          └────────────────┘
```

The worker reads SSE chunks from the agent and republishes each chunk to a `frappe_ai:chunk:<session_id>` realtime event. The browser subscribes via `frappe.realtime.on` before kicking off the stream, so it never holds an SSE connection open itself.

## What's next?

- [INSTALLATION.md](INSTALLATION.md) — detailed setup
- [APP_STRUCTURE.md](APP_STRUCTURE.md) — file layout and customization points
