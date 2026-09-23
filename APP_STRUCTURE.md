# Frappe AI — App Structure

A map of the codebase: what each file does, how the runtime pieces fit together, and where to make common changes.

## File layout

```text
frappe_ai/
├── pyproject.toml              # Python package config (declared deps: requests)
├── package.json                # Frontend dev tooling (vue, typescript, eslint, …)
├── README.md / QUICKSTART.md / INSTALLATION.md / APP_STRUCTURE.md
└── frappe_ai/                  # The Frappe app module
    ├── __init__.py             # __version__
    ├── hooks.py                # App metadata, asset registration, doc_events, boot
    ├── modules.txt             # "AI Assistant"
    ├── patches.txt             # empty; bench requires the file to recognise a Frappe app
    ├── api/
    │   ├── chat.py             # start_stream, cancel_stream, get_recent_messages, _stream_to_agent
    │   ├── confirm.py          # respond, redeem: the Allow / Deny path for an agent write
    │   ├── health.py           # test_connection (called from Settings JS)
    │   └── realtime.py         # broadcast_message_added: the frappe_ai:msg_added hook
    ├── ai_assistant/
    │   ├── doctype/
    │   │   ├── ai_assistant_settings/    # Singleton: enabled, timeout, sidebar_width, …
    │   │   ├── ai_chat_session/          # One row per user conversation
    │   │   └── ai_chat_message/          # One row per message (role, content, tool_*)
    │   └── workspace/Frappe AI/          # Desk workspace JSON
    └── public/
        ├── css/frappe_ai_sidebar.bundle.css   # Sidebar styles (esbuild bundle entry)
        └── js/
            ├── frappe_ai.bundle.ts            # Vue app entry (esbuild bundle entry)
            └── frappe_ai/                     # Vue source tree
                ├── App.vue
                ├── components/                # ChatSidebar, ChatHeader, …, ToolCallCard
                │   └── blocks/                # KPICards, ChartBlock, TableBlock, …
                ├── composables/               # useChat, useSettings
                ├── utils/                     # markdown, context, formatters, …
                └── types/                     # blocks, messages, frappe-globals
```

Both `.bundle.ts` and `.bundle.css` are picked up by Frappe's esbuild bundler (the `.bundle.` suffix convention) and emitted to `sites/assets/frappe_ai/dist/...` with content-hashed filenames. No manual cache-busting needed.

## Request flow

```text
Browser                  Frappe backend                Background worker         AI agent
   │                          │                              │                       │
   │ frappe.realtime.on       │                              │                       │
   │ chunk:<session_id>       │                              │                       │
   │─────────────────────────▶│                              │                       │
   │                          │                              │                       │
   │ chat.start_stream(...)   │                              │                       │
   │─────────────────────────▶│ enqueue (long queue,         │                       │
   │  {session_id}            │  after-commit)               │                       │
   │◀─────────────────────────│─────────────────────────────▶│                       │
   │                          │                              │ POST /api/v1/chat     │
   │                          │                              │ + sid cookie          │
   │                          │                              │──────────────────────▶│
   │                          │                              │                       │
   │                          │                              │ SSE chunks            │
   │ frappe.publish_realtime  │                              │◀──────────────────────│
   │ per chunk                │                              │                       │
   │◀─────────────────────────────────────────────────────────│                       │
   │                          │                              │                       │
   │  {type: "done"} marker   │                              │                       │
   │◀─────────────────────────────────────────────────────────│                       │
```

The channel drawn as `chunk:<session_id>` is `frappe_ai:chunk:<session_id>` in full — the session id the browser generates and passes to `start_stream`, not the `sid` session cookie the worker forwards to the agent. The browser never holds a long SSE connection itself — `frappe.realtime` (socketio) is the transport. The backend is the only thing talking to the agent directly.

## Authentication

The user's `sid` cookie is forwarded to the agent (`requests.post(..., cookies={"sid": _take_sid(sid_key)})`): `start_stream` leaves the sid in the site cache under a one-time key and the job carries only that key, because RQ keeps job arguments for days and shows them to System Managers. The agent is expected to validate the sid against Frappe — there is no OAuth client to provision and no shared secret.

`page_context` (route / doctype / docname / currency) is sanitised by `_sanitize_page_context` before being merged into the request `context`, so a malformed frontend can't smuggle non-grounding data into the system prompt.

## API surface

| Module | Function | Whitelisted | Notes |
| --- | --- | --- | --- |
| `frappe_ai.api.chat` | `start_stream(message, session_id, page_context)` | yes | Enqueues `_stream_to_agent` and returns `{session_id, currency}` |
| `frappe_ai.api.chat` | `cancel_stream(session_id)` | yes | Flags the caller's own relay to stop between chunks |
| `frappe_ai.api.chat` | `get_recent_messages(limit=50)` | yes | Hydrates sidebar from `AI Chat Session` / `AI Chat Message` |
| `frappe_ai.api.chat` | `_stream_to_agent(...)` | no | Background worker, called via `frappe.enqueue` only |
| `frappe_ai.api.confirm` | `respond(confirmation_id, decision)` | yes | Records Allow or Deny; an Allow mints the one-time token |
| `frappe_ai.api.confirm` | `redeem(token, tool, doctype, name)` | yes | Spends that token on one write, for the user and call it was minted for |
| `frappe_ai.api.health` | `test_connection()` | yes | Settings page health check; hits `<agent_url>/health`. System Managers only |
| `frappe_ai.api.realtime` | `broadcast_message_added(doc, method)` | no | `after_insert` hook on `AI Chat Message`; publishes `frappe_ai:msg_added` |

## DocTypes

| DocType | Type | Key fields |
| --- | --- | --- |
| AI Assistant Settings | Single | `enabled`, `timeout`, `sidebar_width`, `keyboard_shortcut`, `agent_url` (read-only mirror of `site_config`) |
| AI Chat Session | Standard | `user`, `title`, `last_activity`, `context_json` |
| AI Chat Message | Standard | `session`, `role`, `content`, `tool_name`, `tool_args_json`, `tool_result_json`, `created_at` |

Neither chat DocType carries a tenant column: the site is the tenancy boundary (see **One agent per site** in `INSTALLATION.md`). A session's start time is Frappe's own `creation`; `last_activity` and `created_at` are kept because the other frontend selects them by name and orders on them.

**AI Assistant Settings** is a Single DocType, so Frappe materialises the document on first read or save; the app installs no `after_install` or `after_migrate` hook and ships no `install.py`. `onload` and `before_save` both refresh the `agent_url` display field from `site_config.json`, so the form shows the live value and a save cannot desync it.

`validate` rejects timeouts outside 1–300s, sidebar widths outside 300–600px, and any keyboard shortcut that collides with a Frappe v16 hard-bound combo.

## Customization

| To change | Edit |
| --- | --- |
| Sidebar UI / layout | `public/js/frappe_ai/components/*.vue` |
| Block renderers (KPI / Chart / Table / Status) | `public/js/frappe_ai/components/blocks/*.vue` |
| Markdown rendering rules | `public/js/frappe_ai/utils/markdown.ts` |
| Streaming + state machine | `public/js/frappe_ai/composables/useChat.ts` |
| Settings persistence | `public/js/frappe_ai/composables/useSettings.ts` |
| Sidebar styles | `public/css/frappe_ai_sidebar.bundle.css` |
| Agent request payload / SSE handling | `frappe_ai/api/chat.py` |
| Health check behaviour | `frappe_ai/api/health.py` |
| Settings validation | `frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.py` |

After editing frontend files, run `bench build --app frappe_ai` (or `bench watch` during development) to rebuild the bundles.

## Testing

Unit tests live alongside their target doctype:

```bash
bench --site your-site.local run-tests --app frappe_ai
```

Current coverage, 28 modules:

- `frappe_ai/api/` — 19 modules, covering the agent URL guard, stream access and credentials, one
  answer at a time, the cancel flag, the timeout chain, the confirmation path, the Error Log rows
  and their references, the recent-messages window, page-context currency and the timezone fallback
- `frappe_ai/ai_assistant/doctype/ai_assistant_settings/` — settings validation and the boot payload
- `frappe_ai/ai_assistant/doctype/ai_chat_session/` — ownership, session delete, personal-data
  erasure and the absence of tenancy columns
- `frappe_ai/ai_assistant/doctype/ai_chat_message/` — the message record

`find frappe_ai -name 'test_*.py'` is the list; the Vitest tier is the `*.test.ts` files beside the
components they cover.
