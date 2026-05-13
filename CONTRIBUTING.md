# Contributing to Frappe AI

A short, opinionated guide. The goal: someone unfamiliar can land a clean PR in an hour.

## Local setup

You need Python 3.14, Node 24, and either a bench at hand or Docker.

```bash
# clone + install dev deps
git clone https://github.com/vyogotech/frappe_ai && cd frappe_ai
uv sync --group dev
npm install
```

Quick sanity check before touching anything:

```bash
uvx ruff check && uvx ruff format --check
uvx pyrefly check
npm run type-check
npm test                      # vitest unit tests (~1s)
npx markdownlint-cli README.md QUICKSTART.md INSTALLATION.md APP_STRUCTURE.md
```

All five should be green. If they aren't on `main`, that's a bug — open an issue.

## Running the test suite against a real bench

The Vitest tier is hermetic — it stubs Frappe globals and never spins up a server. The Frappe Python tests (`bench --site … run-tests --app frappe_ai`) need a real bench.

The CI workflow at `.github/workflows/ci.yml` is the canonical setup — it's the same path you'd take by hand:

1. `bench init --frappe-branch version-16 frappe-bench`
2. `bench get-app https://github.com/vyogotech/frappe_ai`
3. `bench new-site test_site.local --mariadb-root-password … --admin-password admin`
4. `bench --site test_site.local install-app frappe_ai`
5. `bench --site test_site.local run-tests --app frappe_ai`

Browser-driven end-to-end testing is intentionally not part of the test suite. Werkzeug `bench serve` can't reliably simulate the parallel asset loads + socketio handshake that the desk needs for the bundle to mount, so any e2e suite that depends on a real desk render needs a production-shaped Frappe (gunicorn + socketio.js + nginx, like the `central-site` docker stack) rather than CI's lightweight bench. Validate UI flows manually against a real bench before releases.

## Architecture (at a glance)

```text
┌──────────┐  sid    ┌─────────────┐ enqueue ┌──────────────┐
│ browser  │ ──────▶ │ chat.py     │ ──────▶ │ _stream_to_  │
│ (Vue SFC)│         │ start_stream│ (long)  │ agent worker │
└────▲─────┘         └─────────────┘         └──────┬───────┘
     │ realtime: frappe_ai:chunk:<sid>              │ POST /api/v1/chat
     │                                              │ + sid cookie
     │                                              ▼
     └──────────────────────────────────────  external AI agent
```

- **Browser ↔ Frappe**: `frappe.call` for the start request, `frappe.realtime.on` for streamed chunks. No SSE in the browser.
- **Frappe ↔ Agent**: the long-queue RQ worker holds the SSE connection. The user's `sid` cookie is forwarded as auth.
- **Persistence**: external — the agent writes `AI Chat Session` and `AI Chat Message` rows through Frappe's REST API. `chat.get_recent_messages` is read-only.

## What goes in which test tier

| Behaviour you're testing | Tier |
| --- | --- |
| Pure function (formatter, sanitiser, parser) | Vitest (frontend) or `unittest.TestCase` (backend) |
| Component renders / responds to user input | Vitest (Vue Test Utils) |
| DocType validator / install hook / whitelisted endpoint | `bench --site … run-tests` |
| Sidebar mounts, settings page loads, end-to-end flows | Manual verification against a real bench |

If your change touches the user-visible flow, walk through it manually against a running bench (the `central-site` docker stack is the closest production-shaped target). If it changes a Python contract, add a `unittest`. If it changes a TypeScript function, add a Vitest. If you're not sure, start with the cheapest tier that catches it.

## Commit style

- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, etc.
- Imperative mood (`add`, not `added`).
- Subject ≤ 72 chars. Body wraps at 72 too.
- Body explains *why*, not *what*. The diff already shows what.
- Co-author lines for AI-assisted work are encouraged.

## Pull requests

- Branch off `main`. Rebase if `main` moves; don't merge `main` into a feature branch.
- PR title matches the conventional-commit format.
- Tick the boxes in the PR template (or add a quick "Test plan" if there isn't one).
- CI must be green. The lint tier (1–2 min) and integration tier (~10 min) run on every push.

## Releasing

Versions are tracked in `frappe_ai/__init__.py`. Bench reads them for the assets pipeline. Bump the version, update the changelog if applicable, and tag.

## Anti-patterns (things I've removed and don't want to see come back)

- **Manual `apps.txt` editing**: `bench get-app` does this for us. The earlier "append then hope" produced `frappefrappe_ai` when the file lacked a trailing newline. Trust the primitive.
- **Polling instead of realtime**: the old code briefly used `setInterval` to fetch chunks. The current `frappe.realtime` relay is push-only and much cheaper.
- **`frappe_ai_agent_url` stored on the doctype**: it's in `site_config.json`, read-only on the form. Lets ops rotate endpoints without granting DocType write to anyone.
- **OAuth client + Bearer tokens**: superseded by sid-cookie forwarding. If you're tempted to add OAuth, talk to me first — it solves a problem we no longer have.
- **Eager `import echarts`**: large, only some users render charts. Lazy-loaded via `defineAsyncComponent` in `blocks/index.ts`. Don't undo this.

## Questions

For substantive design questions, open an issue with the `discussion` label before writing code. The senior-review notes in `APP_STRUCTURE.md` and the commit messages on `main` are good context.
