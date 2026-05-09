# `frappe_ai` → Frappe-Native Standalone App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `frappe_ai` so any Frappe v16+ bench can run `bench get-app frappe_ai && bench install-app frappe_ai && bench build` and get a working AI sidebar — with no central-site-specific patches required.

**Architecture:** Drop Vite entirely; move Vue SFCs into Frappe's native bundle system at `frappe_ai/frappe_ai/public/js/frappe_ai/` so `bench build` (esbuild + `esbuild-plugin-vue3`) compiles them. Mount the chat sidebar as a third flex sibling of `<body>` (v16+ has `body { display: flex }`); `.main-section` shrinks natively, no CSS push hacks. Stream agent responses via Frappe socketio relay (`publish_realtime`) instead of direct browser-to-agent SSE; the browser only ever talks to its own origin. Agent URL is deployment config (`site_config['frappe_ai_agent_url']`), surfaced as a read-only field in Settings.

**Tech Stack:** Frappe v16+ / esbuild + esbuild-plugin-vue3 / Vue 3 SFCs / TypeScript bundles / `frappe.realtime` (socket.io) / Python `requests` for server-side SSE consumption.

**Spec source:** `~/.claude/plans/good-proceed-with-the-quizzical-map.md`

---

## Working directory

All paths in this plan are relative to `/Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/` unless absolute. The "running bench" referenced in verification steps is the Docker container `central-site-backend` (Frappe v16.17.5 / ERPNext v16.17.0).

When a verification step says `bench build` or `bench --site dev.localhost ...`, run it via:

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && <command>"
```

When a step modifies a tracked file in `frappe_ai/`, the file is also mounted into the container at `/home/frappe/frappe-bench/apps/frappe_ai/`, so changes are visible immediately. Restart workers when Python changes:

```bash
docker compose -f /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml --profile bench restart backend queue-short queue-long scheduler websocket
```

---

## File structure (post-refactor target)

```
frappe_ai/
├── frappe_ai/
│   ├── __init__.py                    # __version__ stays
│   ├── hooks.py                       # MODIFIED: app_include_js, after_install, fixtures, drop cache-bust
│   ├── install.py                     # NEW: after_install reads site_config
│   ├── modules.txt                    # unchanged ("AI Assistant")
│   ├── patches.txt                    # unchanged
│   ├── api/
│   │   ├── __init__.py                # MODIFIED: get_settings (no agent_url)
│   │   ├── ai_query.py                # MODIFIED: keep test_connection, delete query() and _server_agent_url
│   │   └── chat.py                    # NEW: start_stream whitelisted method (socketio relay)
│   ├── ai_assistant/
│   │   ├── doctype/
│   │   │   ├── ai_assistant_settings/
│   │   │   │   ├── ai_assistant_settings.json   # MODIFIED: agent_url read_only=1
│   │   │   │   └── ai_assistant_settings.py     # MODIFIED: validate keyboard_shortcut, before_save reads site_config
│   │   │   ├── ai_chat_message/                 # unchanged
│   │   │   └── ai_chat_session/                 # unchanged
│   │   └── workspace/                          # NEW
│   │       └── frappe_ai/
│   │           └── frappe_ai.json
│   ├── patches/                                 # unchanged
│   └── public/
│       ├── css/
│       │   └── frappe_ai_sidebar.css            # MODIFIED: v16 flex-sibling layout
│       └── js/
│           ├── frappe_ai.bundle.ts              # NEW: bundle entry — replaces frontend/src/main.ts
│           └── frappe_ai/                        # NEW: directory for Vue SFCs and TS modules
│               ├── App.vue                      # moved from frontend/src/App.vue
│               ├── components/                  # moved from frontend/src/components/
│               │   ├── ChatHeader.vue
│               │   ├── ChatInput.vue
│               │   ├── ChatMessages.vue
│               │   ├── ChatSidebar.vue
│               │   ├── MessageBubble.vue
│               │   ├── ToolCallCard.vue
│               │   └── blocks/
│               │       ├── ChartBlock.vue
│               │       ├── KPICards.vue
│               │       ├── StatusList.vue
│               │       ├── TableBlock.vue
│               │       ├── TextBlock.vue
│               │       └── index.ts
│               ├── composables/
│               │   ├── useChat.ts               # MAJOR EDIT: socketio relay, drop fetch path, drop _agentUrl
│               │   └── useSettings.ts
│               ├── types/
│               │   ├── blocks.ts
│               │   ├── frappe-globals.d.ts      # may stay as types-only file at app root
│               │   ├── index.ts
│               │   └── messages.ts
│               └── utils/
│                   ├── context.ts
│                   ├── formatters.ts
│                   └── markdown.ts
├── pyproject.toml                     # MODIFIED: deps consolidated, publisher synced
├── package.json                       # NEW: minimal — npm runtime deps for the bundle
├── README.md                          # unchanged
├── license.txt                        # unchanged
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-05-09-frappe-native-refactor-design.md   # symlink/copy of ~/.claude/plans/<spec>
        └── plans/
            └── 2026-05-09-frappe-native-refactor.md          # this file
```

**Deleted entirely:**
- `frappe_ai/setup.py`
- `frappe_ai/MANIFEST.in`
- `frappe_ai/requirements.txt`
- `frappe_ai/frontend/` (the whole tree — Vite, package.json, src/, scripts/, configs)
- `frappe_ai/frappe_ai/config/desktop.py`
- `frappe_ai/frappe_ai/config/docs.py`

---

## Sequence and dependencies

Phases are sequential. Each is independently shippable: at the end of each phase, `bench build` succeeds and the app installs cleanly. Don't skip phases or go out of order.

| Phase | Depends on | Failure mode if skipped |
|---|---|---|
| 1. Build pipeline migration | — | bench build doesn't produce JS at all |
| 2. Packaging cleanup | 1 | install via `pip install -e` may pick wrong build backend |
| 3. after_install + Settings refactor | — (parallel to 1, 2) | site is installed but agent_url is empty |
| 4. Workspace fixture | — (parallel) | module appears in nav but lacks landing page |
| 5. Frontend wiring (v16 mount, app_ready, shortcut) | 1 | sidebar JS loads but doesn't appear / doesn't bind |
| 6. Streaming relay (socketio) | 1, 3, 5 | chat sends but never streams responses |
| 7. End-to-end verification + central-site cleanup | 1-6 | central-site Containerfile keeps the npm workaround |

---

## Phase 1: Build Pipeline Migration

**What changes:** Vue SFCs and TS modules move from `frontend/src/` into `frappe_ai/frappe_ai/public/js/frappe_ai/`. A new bundle entry `frappe_ai.bundle.ts` replaces `frontend/src/main.ts`. A minimal `package.json` at the app root holds runtime deps so esbuild can resolve them. `frontend/`, `update-hooks.js`, and Vite config are deleted. `hooks.py` is updated to reference the new bundle.

**Why this is risky:** ~1,210 lines of frontend code move in this phase. The two non-mechanical changes are (a) replacing all `@/...` import aliases with relative paths (esbuild doesn't support path aliases), and (b) the new bundle entry point. Everything else is `git mv`.

### Task 1.1: Create app-root `package.json` with runtime deps

**Files:**
- Create: `frappe_ai/package.json`

- [ ] **Step 1: Write the file**

```json
{
  "name": "frappe_ai",
  "version": "0.0.1",
  "private": true,
  "description": "Runtime deps for the frappe_ai bundle (resolved by Frappe's esbuild).",
  "dependencies": {
    "echarts": "^5.6.0",
    "markdown-it": "^14.1.0",
    "vue-echarts": "^7.0.3"
  }
}
```

`vue` itself is NOT listed — Frappe v16's `apps/frappe/node_modules/vue` is found via esbuild's `NODE_PATHS`. Listing it again would shadow Frappe's version.

- [ ] **Step 2: Install the deps**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench/apps/frappe_ai && npm install"
```

Expected: creates `node_modules/` in `frappe_ai/`, ~1500 packages, no errors.

- [ ] **Step 3: Verify resolution from bench**

```bash
docker exec central-site-backend bash -c "ls /home/frappe/frappe-bench/apps/frappe_ai/node_modules/ | grep -E '^(echarts|markdown-it|vue-echarts)$'"
```

Expected:
```
echarts
markdown-it
vue-echarts
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add package.json package-lock.json
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "build: add app-root package.json for bundle runtime deps"
```

---

### Task 1.2: Create the bundle source directory

**Files:**
- Create: `frappe_ai/frappe_ai/public/js/frappe_ai/` (directory)
- Create: `frappe_ai/frappe_ai/public/js/frappe_ai/.gitkeep`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai
touch /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/.gitkeep
```

- [ ] **Step 2: Commit (placeholder)**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/public/js/frappe_ai/.gitkeep
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "build: scaffold public/js/frappe_ai/ for bundle sources"
```

---

### Task 1.3: Migrate type definitions

**Files:**
- Move: `frontend/src/types/blocks.ts` → `frappe_ai/public/js/frappe_ai/types/blocks.ts`
- Move: `frontend/src/types/messages.ts` → `frappe_ai/public/js/frappe_ai/types/messages.ts`
- Move: `frontend/src/types/index.ts` → `frappe_ai/public/js/frappe_ai/types/index.ts`
- Move: `frontend/src/types/frappe-globals.d.ts` → `frappe_ai/public/js/frappe_ai/types/frappe-globals.d.ts`

- [ ] **Step 1: Move files preserving git history**

```bash
cd /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai
mkdir -p frappe_ai/public/js/frappe_ai/types
git mv frontend/src/types/blocks.ts        frappe_ai/public/js/frappe_ai/types/blocks.ts
git mv frontend/src/types/messages.ts      frappe_ai/public/js/frappe_ai/types/messages.ts
git mv frontend/src/types/index.ts         frappe_ai/public/js/frappe_ai/types/index.ts
git mv frontend/src/types/frappe-globals.d.ts frappe_ai/public/js/frappe_ai/types/frappe-globals.d.ts
```

- [ ] **Step 2: Replace `@/` imports with relative paths in moved files**

The only `@/` import inside the type files is in `messages.ts`:

```typescript
// frappe_ai/public/js/frappe_ai/types/messages.ts
import type { ContentBlock } from "./blocks";  // already relative — verify
```

Verify with:
```bash
grep -n "@/" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/types/*.ts
```

Expected: no output (no `@/` imports in types/).

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add -A
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor: move types/ into public/js/frappe_ai/ for native bundle"
```

---

### Task 1.4: Migrate utils/

**Files:**
- Move: `frontend/src/utils/context.ts` → `frappe_ai/public/js/frappe_ai/utils/context.ts`
- Move: `frontend/src/utils/formatters.ts` → `frappe_ai/public/js/frappe_ai/utils/formatters.ts`
- Move: `frontend/src/utils/markdown.ts` → `frappe_ai/public/js/frappe_ai/utils/markdown.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai
mkdir -p frappe_ai/public/js/frappe_ai/utils
git mv frontend/src/utils/context.ts    frappe_ai/public/js/frappe_ai/utils/context.ts
git mv frontend/src/utils/formatters.ts frappe_ai/public/js/frappe_ai/utils/formatters.ts
git mv frontend/src/utils/markdown.ts   frappe_ai/public/js/frappe_ai/utils/markdown.ts
```

- [ ] **Step 2: Audit `@/` imports in utils/**

```bash
grep -n "@/" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/utils/*.ts
```

Expected: no output. (None of the utils import via `@/`; they're leaf modules.)

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add -A
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor: move utils/ into public/js/frappe_ai/"
```

---

### Task 1.5: Migrate composables/

**Files:**
- Move: `frontend/src/composables/useChat.ts` → `frappe_ai/public/js/frappe_ai/composables/useChat.ts`
- Move: `frontend/src/composables/useSettings.ts` → `frappe_ai/public/js/frappe_ai/composables/useSettings.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai
mkdir -p frappe_ai/public/js/frappe_ai/composables
git mv frontend/src/composables/useChat.ts     frappe_ai/public/js/frappe_ai/composables/useChat.ts
git mv frontend/src/composables/useSettings.ts frappe_ai/public/js/frappe_ai/composables/useSettings.ts
```

- [ ] **Step 2: Replace `@/` imports with relative paths in `useChat.ts`**

In `frappe_ai/public/js/frappe_ai/composables/useChat.ts`, find and edit:

```typescript
// Before:
import { getPageContext } from "@/utils/context";
import type { Message, ContentBlock, MessagePart } from "@/types";

// After:
import { getPageContext } from "../utils/context";
import type { Message, ContentBlock, MessagePart } from "../types";
```

- [ ] **Step 3: Verify no `@/` left**

```bash
grep -n "@/" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/composables/*.ts
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add -A
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor: move composables/ into public/js/frappe_ai/, replace @/ aliases with relative paths"
```

---

### Task 1.6: Migrate Vue components (top-level)

**Files:**
- Move: `frontend/src/App.vue` → `frappe_ai/public/js/frappe_ai/App.vue`
- Move: `frontend/src/components/ChatHeader.vue` → `frappe_ai/public/js/frappe_ai/components/ChatHeader.vue`
- Move: `frontend/src/components/ChatInput.vue` → `frappe_ai/public/js/frappe_ai/components/ChatInput.vue`
- Move: `frontend/src/components/ChatMessages.vue` → `frappe_ai/public/js/frappe_ai/components/ChatMessages.vue`
- Move: `frontend/src/components/ChatSidebar.vue` → `frappe_ai/public/js/frappe_ai/components/ChatSidebar.vue`
- Move: `frontend/src/components/MessageBubble.vue` → `frappe_ai/public/js/frappe_ai/components/MessageBubble.vue`
- Move: `frontend/src/components/ToolCallCard.vue` → `frappe_ai/public/js/frappe_ai/components/ToolCallCard.vue`

- [ ] **Step 1: Move files**

```bash
cd /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai
mkdir -p frappe_ai/public/js/frappe_ai/components
git mv frontend/src/App.vue                       frappe_ai/public/js/frappe_ai/App.vue
git mv frontend/src/components/ChatHeader.vue     frappe_ai/public/js/frappe_ai/components/ChatHeader.vue
git mv frontend/src/components/ChatInput.vue      frappe_ai/public/js/frappe_ai/components/ChatInput.vue
git mv frontend/src/components/ChatMessages.vue   frappe_ai/public/js/frappe_ai/components/ChatMessages.vue
git mv frontend/src/components/ChatSidebar.vue    frappe_ai/public/js/frappe_ai/components/ChatSidebar.vue
git mv frontend/src/components/MessageBubble.vue  frappe_ai/public/js/frappe_ai/components/MessageBubble.vue
git mv frontend/src/components/ToolCallCard.vue   frappe_ai/public/js/frappe_ai/components/ToolCallCard.vue
```

- [ ] **Step 2: Rewrite `@/` imports**

In each `.vue` file, replace `@/` imports with relative paths. The mapping rules:

- `@/types/...` → `../types/...` (from `App.vue`) or `../../types/...` (from `components/...`)
- `@/utils/...` → `../utils/...` (from `App.vue`) or `../../utils/...` (from `components/...`)
- `@/composables/...` → `../composables/...` (from `App.vue`) or `../../composables/...` (from `components/...`)

Specific edits (use Edit tool one file at a time):

`frappe_ai/public/js/frappe_ai/components/ChatSidebar.vue`:
```typescript
// Before: import { useChat } from "@/composables/useChat";
// After:  import { useChat } from "../composables/useChat";
```

`frappe_ai/public/js/frappe_ai/components/ChatMessages.vue`:
```typescript
// Before: import type { Message } from "@/types/messages";
// After:  import type { Message } from "../types/messages";
```

`frappe_ai/public/js/frappe_ai/components/MessageBubble.vue`:
```typescript
// Before:
// import { renderMarkdown } from "@/utils/markdown";
// import type { Message } from "@/types/messages";
// After:
import { renderMarkdown } from "../utils/markdown";
import type { Message } from "../types/messages";
```

`frappe_ai/public/js/frappe_ai/components/ToolCallCard.vue`:
```typescript
// Before: import type { ToolCall } from "@/types/messages";
// After:  import type { ToolCall } from "../types/messages";
```

- [ ] **Step 3: Verify no `@/` aliases remain in top-level components**

```bash
grep -rn "@/" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/components/*.vue /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/App.vue
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add -A
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor: move top-level Vue components into public/js/frappe_ai/, replace @/ aliases"
```

---

### Task 1.7: Migrate `components/blocks/`

**Files:**
- Move: `frontend/src/components/blocks/ChartBlock.vue` → `frappe_ai/public/js/frappe_ai/components/blocks/ChartBlock.vue`
- Move: `frontend/src/components/blocks/KPICards.vue` → `frappe_ai/public/js/frappe_ai/components/blocks/KPICards.vue`
- Move: `frontend/src/components/blocks/StatusList.vue` → `frappe_ai/public/js/frappe_ai/components/blocks/StatusList.vue`
- Move: `frontend/src/components/blocks/TableBlock.vue` → `frappe_ai/public/js/frappe_ai/components/blocks/TableBlock.vue`
- Move: `frontend/src/components/blocks/TextBlock.vue` → `frappe_ai/public/js/frappe_ai/components/blocks/TextBlock.vue`
- Move: `frontend/src/components/blocks/index.ts` → `frappe_ai/public/js/frappe_ai/components/blocks/index.ts`

- [ ] **Step 1: Move files**

```bash
cd /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai
mkdir -p frappe_ai/public/js/frappe_ai/components/blocks
git mv frontend/src/components/blocks/ChartBlock.vue   frappe_ai/public/js/frappe_ai/components/blocks/ChartBlock.vue
git mv frontend/src/components/blocks/KPICards.vue     frappe_ai/public/js/frappe_ai/components/blocks/KPICards.vue
git mv frontend/src/components/blocks/StatusList.vue   frappe_ai/public/js/frappe_ai/components/blocks/StatusList.vue
git mv frontend/src/components/blocks/TableBlock.vue   frappe_ai/public/js/frappe_ai/components/blocks/TableBlock.vue
git mv frontend/src/components/blocks/TextBlock.vue    frappe_ai/public/js/frappe_ai/components/blocks/TextBlock.vue
git mv frontend/src/components/blocks/index.ts         frappe_ai/public/js/frappe_ai/components/blocks/index.ts
```

- [ ] **Step 2: Rewrite `@/` imports** — block files are nested 3 deep, so `@/types/...` → `../../types/...`

`frappe_ai/public/js/frappe_ai/components/blocks/ChartBlock.vue`:
```typescript
// Before:
// import { formatValue } from "@/utils/formatters";
// import type { ChartBlock } from "@/types/blocks";
// After:
import { formatValue } from "../../utils/formatters";
import type { ChartBlock } from "../../types/blocks";
```

`frappe_ai/public/js/frappe_ai/components/blocks/KPICards.vue`:
```typescript
import { formatValue } from "../../utils/formatters";
import type { KPIBlock, TrendDirection } from "../../types/blocks";
```

`frappe_ai/public/js/frappe_ai/components/blocks/StatusList.vue`:
```typescript
import type { StatusListBlock, StatusItem } from "../../types/blocks";
```

`frappe_ai/public/js/frappe_ai/components/blocks/TableBlock.vue`:
```typescript
import { formatValue } from "../../utils/formatters";
import type { TableBlock, TableRow } from "../../types/blocks";
```

`frappe_ai/public/js/frappe_ai/components/blocks/TextBlock.vue`:
```typescript
import type { TextBlock } from "../../types/blocks";
```

`frappe_ai/public/js/frappe_ai/components/blocks/index.ts`:
```typescript
import type { BlockType } from "../../types/blocks";
```

- [ ] **Step 3: Verify**

```bash
grep -rn "@/" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/public/js/frappe_ai/components/blocks/
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add -A
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor: move components/blocks/ into public/js/frappe_ai/, replace @/ aliases"
```

---

### Task 1.8: Create the bundle entry point

**Files:**
- Create: `frappe_ai/frappe_ai/public/js/frappe_ai.bundle.ts`

This replaces `frontend/src/main.ts` as the entry. It is a thin shim that imports from `./frappe_ai/`. It also keeps the existing structure (settings load, Vue mount, navbar/sidebar injection) — Phase 5 will replace the navbar polling and add the v16 flex-sibling mount.

- [ ] **Step 1: Write the bundle entry**

```typescript
// frappe_ai/frappe_ai/public/js/frappe_ai.bundle.ts
/**
 * Bundle entry — compiled by Frappe's esbuild + esbuild-plugin-vue3.
 * Output: /assets/frappe_ai/dist/js/frappe_ai.bundle.<hash>.js
 *
 * Sourced from public/js/frappe_ai/* — Vue SFCs, composables, types, utils.
 * Phase 1 keeps the existing bootstrap behavior; Phase 5 replaces the
 * polling-based navbar injection and adds the v16 flex-sibling mount.
 */

import { createApp } from "vue";
import App from "./frappe_ai/App.vue";
import { setAgentUrl } from "./frappe_ai/composables/useChat";

const CONTAINER_ID = "frappe-ai-sidebar-root";

interface FrappeAISettings {
  enabled?: boolean;
  agent_url?: string;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const state = {
  enabled: false,
  agentUrl: "",
  sidebarWidth: 380,
  keyboardShortcut: "Ctrl+/",
  ready: false,
};

async function loadSettings(): Promise<void> {
  if (typeof frappe === "undefined") return;
  try {
    const settings = await new Promise<FrappeAISettings | undefined>((resolve, reject) => {
      frappe.call<FrappeAISettings>({
        method: "frappe_ai.api.get_settings",
        callback: (r) => resolve(r.message),
        error: reject,
      });
    });
    if (settings) {
      state.enabled = Boolean(settings.enabled);
      state.agentUrl = settings.agent_url || "";
      state.sidebarWidth = settings.sidebar_width || 380;
      state.keyboardShortcut = settings.keyboard_shortcut || "Ctrl+/";
      if (state.agentUrl) {
        setAgentUrl(state.agentUrl);
      }
    }
  } catch (err) {
    console.warn("[Frappe AI] Could not load settings:", err);
  }
  state.ready = true;
}

function mountApp(): void {
  if (document.getElementById(CONTAINER_ID)) return;
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  createApp(App, {
    sidebarWidth: state.sidebarWidth,
    keyboardShortcut: state.keyboardShortcut,
  }).mount(container);
}

function bootstrap(): void {
  if (typeof frappe === "undefined") {
    state.enabled = true;
    state.ready = true;
    mountApp();
    return;
  }

  $(document).on("app_ready", () => {
    loadSettings().then(() => {
      if (state.enabled) {
        mountApp();
      }
    });
  });
}

bootstrap();
```

This is intentionally minimal — Phase 5 replaces this with the v16 flex-sibling mount, keyboard shortcut binding, and version check.

- [ ] **Step 2: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/public/js/frappe_ai.bundle.ts
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "build: add frappe_ai.bundle.ts as the native bundle entry point"
```

---

### Task 1.9: Update `hooks.py` to reference the new bundle

**Files:**
- Modify: `frappe_ai/frappe_ai/hooks.py:14-15`

- [ ] **Step 1: Edit the asset includes**

Find:
```python
app_include_css = "/assets/frappe_ai/css/frappe_ai_sidebar.css?v=651f3697"
app_include_js = "/assets/frappe_ai/frontend/dist/js/frappe_ai.js?v=ffa8d75e"
```

Replace with:
```python
# Frappe's bundler resolves these to hashed paths in /assets/frappe_ai/dist/...
# via sites/assets/assets.json, no manual cache-bust query strings needed.
app_include_css = "frappe_ai_sidebar.css"
app_include_js = "frappe_ai.bundle.js"
```

- [ ] **Step 2: Verify by inspecting the file**

```bash
grep -n "app_include" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/hooks.py
```

Expected output:
```
14:app_include_css = "frappe_ai_sidebar.css"
15:app_include_js = "frappe_ai.bundle.js"
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/hooks.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "build: hooks.py references native bundle paths (no cache-bust)"
```

---

### Task 1.10: Delete the `frontend/` directory and `update-hooks.js`

**Files:**
- Delete: `frappe_ai/frontend/` (entire tree — vite config, package.json, src/, scripts/, eslint, postcss, tsconfig, vitest)

- [ ] **Step 1: Confirm `frontend/src/` is empty (everything migrated)**

```bash
find /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frontend/src -type f 2>/dev/null
```

Expected: only `__tests__/` files (legacy Vitest tests) and `composables/__tests__/_mock-sse.ts`. These are dropped — Phase 1 does not preserve Vitest. (See "Tests" note below.)

- [ ] **Step 2: Delete the directory**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai rm -r frontend/
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "build: remove Vite-based frontend/ tree; bundles now live under public/js/"
```

**Tests note:** The existing Vitest unit tests (`__tests__/MessageBubble.test.ts`, `__tests__/ChatInput.test.ts`, `__tests__/useChat.test.ts`) are dropped in this refactor. Vitest depends on Vite. We're not running JS unit tests for now. Phase 6 adds Python integration tests for the new chat API. If JS unit tests are wanted later, add them as a separate test runner (e.g., a `tests/js/` directory using `vitest` independently of the build pipeline).

---

### Task 1.11: Verify the bundle builds end-to-end

- [ ] **Step 1: Run `bench build`**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench build --app frappe_ai 2>&1" | tail -20
```

Expected: lines like `DONE  Total Build Time` and a `frappe_ai.bundle.<hash>.js` entry produced.

- [ ] **Step 2: Confirm the hashed output exists**

```bash
docker exec central-site-backend bash -c "ls /home/frappe/frappe-bench/sites/assets/frappe_ai/dist/js/ 2>/dev/null"
```

Expected output (hash will vary):
```
frappe_ai.bundle.A1B2C3D4.js
```

- [ ] **Step 3: Confirm `assets.json` resolves the bundle**

```bash
docker exec central-site-backend bash -c "grep frappe_ai.bundle /home/frappe/frappe-bench/sites/assets/assets.json"
```

Expected: a JSON entry mapping `frappe_ai.bundle.js` → `/assets/frappe_ai/dist/js/frappe_ai.bundle.<hash>.js`.

- [ ] **Step 4: Confirm the CSS bundle is present**

```bash
docker exec central-site-backend bash -c "ls /home/frappe/frappe-bench/sites/assets/frappe_ai/dist/css/ 2>/dev/null"
```

Expected: `frappe_ai_sidebar.css` (or hashed). If the CSS doesn't appear, Frappe needs the bundle filename to be `*.bundle.css` to process it. **If missing**, rename `public/css/frappe_ai_sidebar.css` to `public/css/frappe_ai_sidebar.bundle.css` and update `hooks.py` accordingly.

- [ ] **Step 5: Browser smoke check**

Open `http://localhost:8080` (central-site) → log in → DevTools Network tab → confirm `frappe_ai.bundle.<hash>.js` is loaded with HTTP 200 and the page shows no `[Frappe AI]` errors in the console.

- [ ] **Step 6: Commit verification artifact (none needed; just confirm green)**

If anything fails, do NOT proceed to Phase 2. Common failure modes and fixes:

- "Cannot find module" → an `@/` import was missed. `grep -rn "@/" frappe_ai/public/js/` and replace.
- "Vue is not a constructor" → `vue` package not findable. Confirm `apps/frappe/node_modules/vue` exists.
- "esbuild-plugin-vue3 not found" → run `cd apps/frappe && yarn install` inside the container.
- The 404 on the JS asset → `app_include_js` path wrong. Match exactly to the bundle filename.

---

## Phase 2: Packaging Cleanup

**What changes:** Delete `setup.py`, `MANIFEST.in`, `requirements.txt`. Consolidate into `pyproject.toml`. Sync the publisher metadata across `pyproject.toml` and `hooks.py`.

### Task 2.1: Update `pyproject.toml`

**Files:**
- Modify: `frappe_ai/pyproject.toml`

- [ ] **Step 1: Replace the `[project]` block**

Find:
```toml
[project]
name = "frappe_ai"
authors = [
    { name = "Vyogo Technologies", email = "support@vyogolabs.tech"}
]
description = "AI power for Awesome Bar"
requires-python = ">=3.10"
readme = "README.md"
dynamic = ["version"]
dependencies = [
    # "frappe~=15.0.0" # Installed and managed by bench.
]
```

Replace with:
```toml
[project]
name = "frappe_ai"
authors = [
    { name = "Vyogo Technologies", email = "support@vyogolabs.tech" }
]
description = "Native Frappe AI assistant sidebar — chat with your ERPNext data."
requires-python = ">=3.10"
readme = "README.md"
license = { file = "license.txt" }
dynamic = ["version"]
dependencies = [
    # frappe is installed and managed by bench. requests is a transitive
    # dep of frappe so we don't list it explicitly.
]
```

- [ ] **Step 2: Verify**

```bash
grep -A 12 "^\[project\]" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/pyproject.toml
```

Expected: matches what we wrote.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add pyproject.toml
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "chore: consolidate metadata in pyproject.toml; describe deps explicitly"
```

---

### Task 2.2: Delete legacy packaging files

**Files:**
- Delete: `frappe_ai/setup.py`
- Delete: `frappe_ai/MANIFEST.in`
- Delete: `frappe_ai/requirements.txt`

- [ ] **Step 1: Delete**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai rm setup.py MANIFEST.in requirements.txt
```

- [ ] **Step 2: Verify pip can still install**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && ./env/bin/pip install -e ./apps/frappe_ai --no-deps 2>&1 | tail -5"
```

Expected: `Successfully installed frappe-ai-0.0.1` (uses `flit_core` from `pyproject.toml`, no setup.py needed).

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "chore: drop legacy setup.py / MANIFEST.in / requirements.txt"
```

---

### Task 2.3: Sync publisher in `hooks.py`

**Files:**
- Modify: `frappe_ai/frappe_ai/hooks.py:5-7`

- [ ] **Step 1: Edit publisher metadata**

Find:
```python
app_publisher = "Frappe"
app_description = "AI Assistant Integration for Frappe/ERPNext using MCP Server"
app_email = "developers@frappe.io"
```

Replace with:
```python
app_publisher = "Vyogo Technologies"
app_description = "Native Frappe AI assistant sidebar — chat with your ERPNext data."
app_email = "support@vyogolabs.tech"
```

- [ ] **Step 2: Verify**

```bash
grep -E "app_publisher|app_email|app_description" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/hooks.py | head -3
```

Expected: matches `pyproject.toml`'s author block.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/hooks.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "chore: sync publisher metadata across pyproject.toml and hooks.py"
```

---

## Phase 3: `after_install` Hook + Settings DocType Refactor

**What changes:** New `frappe_ai/install.py` reads `frappe_ai_agent_url` from `site_config` on first install and populates Settings. Settings DocType `agent_url` field becomes read-only and is rewritten from `site_config` on every save. The whitelisted `get_settings()` no longer exposes `agent_url` to the browser (it doesn't need it).

### Task 3.1: Create `install.py`

**Files:**
- Create: `frappe_ai/frappe_ai/install.py`

- [ ] **Step 1: Write the file**

```python
# frappe_ai/frappe_ai/install.py
"""
Post-install bootstrap.

Reads `frappe_ai_agent_url` from site_config and populates the
AI Assistant Settings Single. Idempotent — re-running install or
migration does not overwrite an existing user-configured URL unless
site_config has changed.
"""

import frappe


def after_install() -> None:
	"""Populate AI Assistant Settings from site_config on first install."""
	_sync_settings_from_site_config()


def after_migrate() -> None:
	"""Re-sync on migrate so site_config changes take effect on bench update."""
	_sync_settings_from_site_config()


def _sync_settings_from_site_config() -> None:
	site_config_url = (frappe.local.conf or {}).get("frappe_ai_agent_url") or ""
	site_config_url = site_config_url.rstrip("/")

	settings = frappe.get_single("AI Assistant Settings")
	if settings.agent_url == site_config_url:
		return

	settings.agent_url = site_config_url
	settings.flags.ignore_permissions = True
	settings.flags.ignore_validate = True
	settings.save()
	frappe.db.commit()
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/install.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat: install.py syncs Settings.agent_url from site_config (after_install + after_migrate)"
```

---

### Task 3.2: Register `after_install` and `after_migrate` in `hooks.py`

**Files:**
- Modify: `frappe_ai/frappe_ai/hooks.py:66-67` (replace the commented placeholders)

- [ ] **Step 1: Edit hooks**

Find:
```python
# before_install = "frappe_ai.install.before_install"
# after_install = "frappe_ai.install.after_install"
```

Replace with:
```python
after_install = "frappe_ai.install.after_install"
after_migrate = "frappe_ai.install.after_migrate"
```

- [ ] **Step 2: Verify**

```bash
grep -E "^after_install|^after_migrate" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/hooks.py
```

Expected:
```
after_install = "frappe_ai.install.after_install"
after_migrate = "frappe_ai.install.after_migrate"
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/hooks.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat: register after_install and after_migrate hooks"
```

---

### Task 3.3: Make `agent_url` read-only in Settings DocType JSON

**Files:**
- Modify: `frappe_ai/frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.json`

- [ ] **Step 1: Edit the agent_url field definition**

Find:
```json
{
   "description": "URL of the AI agent as reachable from the user's browser (e.g. http://localhost:8484).",
   "fieldname": "agent_url",
   "fieldtype": "Data",
   "label": "Agent URL",
   "reqd": 1
  },
```

Replace with:
```json
{
   "description": "Agent URL is sourced from site_config['frappe_ai_agent_url']. To change, run: bench set-config -s <site> frappe_ai_agent_url <url> && bench restart.",
   "fieldname": "agent_url",
   "fieldtype": "Data",
   "label": "Agent URL",
   "read_only": 1
  },
```

(Note `reqd: 1` is removed because the value is now sourced externally — making it required would block save when site_config is unset.)

- [ ] **Step 2: Verify**

```bash
docker exec central-site-backend bash -c "python3 -c \"import json; d=json.load(open('/home/frappe/frappe-bench/apps/frappe_ai/frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.json')); f=[x for x in d['fields'] if x['fieldname']=='agent_url'][0]; print(f.get('read_only'), f.get('reqd'))\""
```

Expected: `1 None`

- [ ] **Step 3: Reload doctype on the running site**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost reload-doctype 'AI Assistant Settings' 2>&1 | tail -5"
```

Expected: `Updating DocType for AI Assistant Settings ...` finishing successfully.

- [ ] **Step 4: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.json
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(settings): agent_url is read-only; sourced from site_config"
```

---

### Task 3.4: Update Settings controller — `before_save` reads site_config + validate keyboard_shortcut

**Files:**
- Modify: `frappe_ai/frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.py`

- [ ] **Step 1: Replace the controller**

Replace the entire file contents with:

```python
# Copyright (c) 2024, Vyogo and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


_VALID_SHORTCUT = re.compile(r"^(Ctrl|Alt|Shift|Meta|Cmd)(\+(Ctrl|Alt|Shift|Meta|Cmd))*\+[A-Za-z0-9/.,;'\[\]\\\-=]$")


class AIAssistantSettings(Document):
	def before_save(self):
		# agent_url is deployment config; refresh it from site_config on every save
		# so the Settings page shows the current value even after admins try to type
		# something else into the read-only field via developer tools.
		site_config_url = (frappe.local.conf or {}).get("frappe_ai_agent_url") or ""
		self.agent_url = site_config_url.rstrip("/")

	def validate(self):
		if self.timeout is not None:
			if self.timeout < 1:
				frappe.throw("Timeout must be at least 1 second")
			if self.timeout > 300:
				frappe.throw("Timeout cannot exceed 300 seconds (5 minutes)")

		if self.sidebar_width is not None:
			if self.sidebar_width < 300:
				frappe.throw("Sidebar width must be at least 300 pixels")
			if self.sidebar_width > 600:
				frappe.throw("Sidebar width cannot exceed 600 pixels")

		if self.keyboard_shortcut and not _VALID_SHORTCUT.match(self.keyboard_shortcut):
			frappe.throw(
				"Keyboard shortcut must be in the form 'Modifier+Key', e.g. 'Ctrl+/' or 'Ctrl+Shift+A'. "
				"Allowed modifiers: Ctrl, Alt, Shift, Meta, Cmd."
			)

	@frappe.whitelist()
	def test_connection(self) -> dict:
		"""Doctype-button helper: probe the agent's /health endpoint."""
		import requests

		url = (frappe.local.conf or {}).get("frappe_ai_agent_url") or ""
		if not url:
			return {"success": False, "message": "site_config['frappe_ai_agent_url'] is not set"}

		try:
			resp = requests.get(f"{url.rstrip('/')}/health", timeout=5)
			if resp.status_code == 200:
				return {"success": True, "message": f"Healthy at {url}"}
			return {"success": False, "message": f"Unhealthy: HTTP {resp.status_code}"}
		except requests.exceptions.RequestException as exc:
			return {"success": False, "message": f"Cannot reach agent: {exc}"}
```

- [ ] **Step 2: Verify Python syntax**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && ./env/bin/python -c 'from frappe_ai.ai_assistant.doctype.ai_assistant_settings.ai_assistant_settings import AIAssistantSettings; print(AIAssistantSettings)'"
```

Expected: `<class 'frappe_ai.ai_assistant.doctype.ai_assistant_settings.ai_assistant_settings.AIAssistantSettings'>`

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/ai_assistant/doctype/ai_assistant_settings/ai_assistant_settings.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(settings): before_save syncs from site_config; validate keyboard_shortcut format; add test_connection method"
```

---

### Task 3.5: Stop exposing `agent_url` to the browser via `get_settings`

**Files:**
- Modify: `frappe_ai/frappe_ai/api/__init__.py`

- [ ] **Step 1: Replace `get_settings`**

Replace the file contents with:

```python
"""Public API for the Frappe AI frontend."""

import frappe


@frappe.whitelist()
def get_settings() -> dict:
	"""Return AI Assistant Settings flags + UI prefs needed by the sidebar.

	Note: `agent_url` is intentionally NOT exposed. The browser never speaks
	to the agent directly — chat goes through the socketio relay in
	frappe_ai.api.chat.start_stream.
	"""
	settings = frappe.get_single("AI Assistant Settings")
	return {
		"enabled": bool(settings.enabled),
		"sidebar_width": getattr(settings, "sidebar_width", None) or 380,
		"keyboard_shortcut": getattr(settings, "keyboard_shortcut", None) or "Ctrl+/",
	}
```

- [ ] **Step 2: Verify**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost console <<< 'import frappe_ai.api; print(frappe_ai.api.get_settings())' 2>&1 | tail -5"
```

Expected: a dict with `enabled`, `sidebar_width`, `keyboard_shortcut` — no `agent_url` key.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/api/__init__.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(api): get_settings stops exposing agent_url; browser doesn't need it"
```

---

### Task 3.6: Phase 3 verification

- [ ] **Step 1: Set site_config and trigger a re-sync**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost set-config frappe_ai_agent_url http://frappe-ai-agent:8484"
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost migrate 2>&1 | tail -10"
```

Expected: migrate runs `after_migrate`, which calls `_sync_settings_from_site_config`. No errors.

- [ ] **Step 2: Confirm Settings reflects the new URL**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost console <<< 'import frappe; s = frappe.get_single(\"AI Assistant Settings\"); print(\"agent_url:\", s.agent_url)' 2>&1 | tail -3"
```

Expected: `agent_url: http://frappe-ai-agent:8484`

- [ ] **Step 3: Confirm UI shows it as read-only**

Open `http://localhost:8080/app/ai-assistant-settings` → confirm the "Agent URL" field shows `http://frappe-ai-agent:8484` and is greyed out (cannot edit).

If anything fails, do NOT proceed to Phase 4. Common failure modes:

- `agent_url` not synced → check `frappe.local.conf.get("frappe_ai_agent_url")` returns the value; restart workers.
- Field still editable → reload the doctype (`bench reload-doctype 'AI Assistant Settings'`) and hard-refresh the browser.

---

## Phase 4: Workspace Fixture (replace `config/desktop.py`)

**What changes:** Add a Workspace JSON fixture that creates a "Frappe AI" landing page with shortcuts to Settings, AI Chat Sessions, and AI Chat Messages. Remove the legacy `config/desktop.py` and `config/docs.py` (unused since v13).

### Task 4.1: Create the Workspace fixture

**Files:**
- Create: `frappe_ai/frappe_ai/ai_assistant/workspace/frappe_ai/frappe_ai.json`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/ai_assistant/workspace/frappe_ai
```

- [ ] **Step 2: Write the fixture**

```json
{
 "app": "frappe_ai",
 "charts": [],
 "content": "[{\"id\":\"intro\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\\"h4\\\"><b>Frappe AI</b></span>\",\"col\":12}},{\"id\":\"shortcuts\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"AI Assistant Settings\",\"col\":4}},{\"id\":\"sessions\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"AI Chat Sessions\",\"col\":4}},{\"id\":\"messages\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"AI Chat Messages\",\"col\":4}}]",
 "creation": "2026-05-09 00:00:00.000000",
 "custom_blocks": [],
 "docstatus": 0,
 "doctype": "Workspace",
 "for_user": "",
 "hide_custom": 0,
 "icon": "message-square",
 "idx": 0,
 "is_hidden": 0,
 "label": "Frappe AI",
 "links": [
  {
   "hidden": 0,
   "is_query_report": 0,
   "label": "Conversations",
   "link_count": 0,
   "onboard": 0,
   "type": "Link Group"
  },
  {
   "dependencies": "",
   "hidden": 0,
   "is_query_report": 0,
   "label": "AI Chat Session",
   "link_count": 0,
   "link_to": "AI Chat Session",
   "link_type": "DocType",
   "onboard": 1,
   "type": "Link"
  },
  {
   "dependencies": "",
   "hidden": 0,
   "is_query_report": 0,
   "label": "AI Chat Message",
   "link_count": 0,
   "link_to": "AI Chat Message",
   "link_type": "DocType",
   "onboard": 0,
   "type": "Link"
  }
 ],
 "modified": "2026-05-09 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "AI Assistant",
 "name": "Frappe AI",
 "number_cards": [],
 "owner": "Administrator",
 "parent_page": "",
 "public": 1,
 "quick_lists": [],
 "roles": [],
 "sequence_id": 100.0,
 "shortcuts": [
  {
   "color": "Blue",
   "format": "{} Open",
   "label": "AI Assistant Settings",
   "link_to": "AI Assistant Settings",
   "stats_filter": "",
   "type": "DocType"
  },
  {
   "color": "Grey",
   "format": "{} Total",
   "label": "AI Chat Sessions",
   "link_to": "AI Chat Session",
   "stats_filter": "",
   "type": "DocType"
  },
  {
   "color": "Grey",
   "format": "{} Total",
   "label": "AI Chat Messages",
   "link_to": "AI Chat Message",
   "stats_filter": "",
   "type": "DocType"
  }
 ],
 "title": "Frappe AI"
}
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/ai_assistant/workspace/
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(workspace): ship Frappe AI Workspace fixture"
```

---

### Task 4.2: Delete legacy `config/`

**Files:**
- Delete: `frappe_ai/frappe_ai/config/desktop.py`
- Delete: `frappe_ai/frappe_ai/config/docs.py`
- Keep: `frappe_ai/frappe_ai/config/__init__.py` (Python package marker; referenced by Frappe internals)

- [ ] **Step 1: Delete**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai rm frappe_ai/config/desktop.py frappe_ai/config/docs.py
```

- [ ] **Step 2: Verify config/ still has __init__.py**

```bash
ls /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/frappe_ai/config/
```

Expected: only `__init__.py`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "chore: remove legacy config/desktop.py and config/docs.py (replaced by Workspace fixture)"
```

---

### Task 4.3: Verify Workspace loads on migrate

- [ ] **Step 1: Run migrate**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost migrate 2>&1 | tail -10"
```

Expected: no errors. The Workspace fixture should load.

- [ ] **Step 2: Confirm in DB**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost console <<< 'import frappe; print(frappe.db.get_value(\"Workspace\", \"Frappe AI\", [\"name\", \"public\", \"module\"]))' 2>&1 | tail -3"
```

Expected: `('Frappe AI', 1, 'AI Assistant')`

- [ ] **Step 3: Browser smoke check**

Open `http://localhost:8080/app/frappe-ai` → should render the Frappe AI workspace landing page with three shortcuts (Settings, Sessions, Messages).

---

## Phase 5: Frontend Wiring (v16 flex mount, app_ready, keyboard shortcut, user_email bug)

**What changes:** Replace `setInterval` polling with `app_ready` listener. Refuse to mount on Frappe v15. Mount the AI sidebar as a third flex sibling of `<body>`. Wire `frappe.ui.keys.add_shortcut` for Ctrl+/. Fix the `user_email` copy-paste bug. Update CSS for the new layout.

### Task 5.1: Rewrite `frappe_ai.bundle.ts` with v16-native mount + app_ready + keyboard shortcut

**Files:**
- Modify: `frappe_ai/frappe_ai/public/js/frappe_ai.bundle.ts` (complete rewrite of bootstrap logic)

- [ ] **Step 1: Replace the bundle entry**

Overwrite the file contents with:

```typescript
/**
 * Bundle entry — compiled by Frappe's esbuild + esbuild-plugin-vue3.
 * Output: /assets/frappe_ai/dist/js/frappe_ai.bundle.<hash>.js
 *
 * Mounting strategy: append a flex sibling to <body>. v16 has
 * body { display: flex; flex-direction: row }, so adding a third
 * sibling next to .body-sidebar-container and .main-section makes
 * .main-section shrink natively. No CSS push variables, no DOM-internal
 * injection.
 */

import { createApp, ref, type App as VueApp } from "vue";
import App from "./frappe_ai/App.vue";

interface FrappeAISettings {
  enabled?: boolean;
  sidebar_width?: number;
  keyboard_shortcut?: string;
}

const SIDEBAR_CLASS = "frappe-ai-sidebar";
const TOGGLE_BTN_ID = "frappe-ai-toggle-btn";

const visible = ref(false);

function toggle(): void {
  visible.value = !visible.value;
  const $sidebar = document.querySelector(`.${SIDEBAR_CLASS}`) as HTMLElement | null;
  if (!$sidebar) return;
  if (visible.value) {
    $sidebar.removeAttribute("hidden");
    $sidebar.classList.add("opened");
  } else {
    $sidebar.setAttribute("hidden", "");
    $sidebar.classList.remove("opened");
  }
}

async function loadSettings(): Promise<FrappeAISettings> {
  return new Promise((resolve) => {
    frappe.call<FrappeAISettings>({
      method: "frappe_ai.api.get_settings",
      callback: (r) => resolve(r.message ?? {}),
      error: () => resolve({}),
    });
  });
}

function injectNavbarButton(shortcut: string): void {
  if (document.getElementById(TOGGLE_BTN_ID)) return;
  // The navbar is rendered before app_ready fires, but the icons row
  // can be inside .desktop-navbar (v16) or .navbar-right (older).
  const navIconsRow =
    document.querySelector(".desktop-navbar .navbar-icons") ||
    document.querySelector(".navbar-right");
  if (!navIconsRow) {
    console.warn("[Frappe AI] Could not find a navbar to inject the toggle button.");
    return;
  }

  const btn = document.createElement("button");
  btn.id = TOGGLE_BTN_ID;
  btn.className = "btn-reset nav-link text-muted";
  btn.title = `Frappe AI (${shortcut})`;
  btn.innerHTML = frappe.utils.icon("message-square-text", "sm");
  btn.addEventListener("click", toggle);
  navIconsRow.prepend(btn);
}

function mountSidebar(opts: { sidebarWidth: number; keyboardShortcut: string }): VueApp | null {
  if (document.querySelector(`.${SIDEBAR_CLASS}`)) return null;

  const wrapper = document.createElement("div");
  wrapper.className = SIDEBAR_CLASS;
  wrapper.setAttribute("hidden", "");
  // Width comes from settings; CSS uses --frappe-ai-width as the source of truth.
  wrapper.style.setProperty("--frappe-ai-width", `${opts.sidebarWidth}px`);
  document.body.appendChild(wrapper);

  const app = createApp(App, {
    sidebarWidth: opts.sidebarWidth,
    keyboardShortcut: opts.keyboardShortcut,
    visible,
    onClose: () => {
      visible.value = false;
      wrapper.setAttribute("hidden", "");
      wrapper.classList.remove("opened");
    },
  });
  app.mount(wrapper);
  return app;
}

function bindShortcut(shortcut: string): void {
  if (!frappe?.ui?.keys?.add_shortcut) return;
  // Normalize the user-supplied form (e.g. "Ctrl+/") to Frappe's expected
  // lowercase form ("ctrl+/").
  const normalized = shortcut
    .split("+")
    .map((p) => p.toLowerCase())
    .join("+");

  frappe.ui.keys.add_shortcut({
    shortcut: normalized,
    action: () => toggle(),
    description: __("Toggle Frappe AI sidebar"),
    ignore_inputs: false,
  });
}

function bootstrap(): void {
  if (typeof frappe === "undefined") {
    return;
  }

  $(document).on("app_ready", async () => {
    // Refuse to mount on v15 — relies on body { display: flex } from v16.
    const frappeVersion = frappe?.boot?.versions?.frappe;
    if (!frappeVersion || frappeVersion.startsWith("15")) {
      console.warn("[Frappe AI] Requires Frappe v16+. Skipping mount.");
      return;
    }

    const settings = await loadSettings();
    if (!settings.enabled) {
      return;
    }

    const sidebarWidth = settings.sidebar_width || 380;
    const keyboardShortcut = settings.keyboard_shortcut || "Ctrl+/";

    mountSidebar({ sidebarWidth, keyboardShortcut });
    injectNavbarButton(keyboardShortcut);
    bindShortcut(keyboardShortcut);
  });
}

bootstrap();
```

Three notable behavior changes vs. the previous bundle:

- **No `setInterval` polling** — `app_ready` is the contract.
- **No agent_url state** — the browser never knows the URL.
- **Keyboard shortcut uses `frappe.ui.keys.add_shortcut`** — appears in Frappe's standard shortcut help dialog (Shift+/).

- [ ] **Step 2: Update App.vue's prop signature**

`frappe_ai/public/js/frappe_ai/App.vue` currently expects `sidebarWidth: number, keyboardShortcut: string`. Add `visible` (boolean ref) and emit `close`. Edit the `defineProps` and `<script setup>` block:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, type Ref } from "vue";
import ChatSidebar from "./components/ChatSidebar.vue";

const props = defineProps<{
  sidebarWidth: number;
  keyboardShortcut: string;
  visible: Ref<boolean>;
}>();

const emit = defineEmits<{ close: [] }>();

function handleClose() {
  emit("close");
}

// The wrapper div manages hidden via attribute; nothing to do here besides
// re-rendering on visibility changes.
</script>

<template>
  <ChatSidebar
    v-show="visible.value"
    :sidebar-width="sidebarWidth"
    :keyboard-shortcut="keyboardShortcut"
    :visible="visible.value"
    @close="handleClose"
  />
</template>
```

(The existing template's overlay div and Transition wrapper are removed — the sidebar now lives directly inside its `.frappe-ai-sidebar` flex parent and visibility is managed at the wrapper level via `hidden`.)

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/public/js/frappe_ai.bundle.ts frappe_ai/public/js/frappe_ai/App.vue
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(frontend): v16-native flex-sibling mount; app_ready listener; frappe.ui.keys.add_shortcut; v15 refusal"
```

---

### Task 5.2: Update CSS for v16 flex layout

**Files:**
- Modify: `frappe_ai/frappe_ai/public/css/frappe_ai_sidebar.css`

- [ ] **Step 1: Replace the file**

Overwrite with:

```css
/*
 * Mounted as a flex sibling of <body>. In Frappe v16, body is
 * display: flex; flex-direction: row, so this sidebar sits next to
 * .body-sidebar-container and .main-section as a flex item.
 */

.frappe-ai-sidebar {
  width: var(--frappe-ai-width, 380px);
  height: 100vh;
  flex-shrink: 0;
  background: var(--bg-color, #fff);
  border-left: 1px solid var(--border-color, #e2e6e9);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1;
}

.frappe-ai-sidebar[hidden] {
  display: none;
}

#frappe-ai-toggle-btn {
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  color: var(--text-muted, #6c7680);
  border-radius: var(--border-radius-sm, 4px);
}

#frappe-ai-toggle-btn:hover {
  background: var(--fg-hover-color, #f3f3f3);
  color: var(--text-color, #2c3641);
}

/* Mobile: overlay (mirror form_sidebar pattern) */
@media (max-width: 991.98px) {
  .frappe-ai-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 420px;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    z-index: 1030;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
  }
  .frappe-ai-sidebar.opened {
    transform: translateX(0);
  }
  .frappe-ai-sidebar[hidden] {
    /* On mobile we still want the slide animation, so override the display:none. */
    display: flex;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/public/css/frappe_ai_sidebar.css
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "style: rewrite sidebar CSS for v16 flex-sibling layout; mobile overlay; design tokens"
```

---

### Task 5.3: Fix the `user_email` copy-paste bug

**Files:**
- Modify: `frappe_ai/frappe_ai/public/js/frappe_ai/composables/useChat.ts:130-141` (the `_sendSSE` body construction)

- [ ] **Step 1: Locate the bug**

The current code (after Phase 1 migration) has:

```typescript
const body = JSON.stringify({
  message: content,
  session_id: sessionId.value,
  context: {
    user_id: frappe?.session?.user ?? "",
    user_email: frappe?.session?.user ?? "",
    timestamp: new Date().toISOString(),
    ...ctx,
  },
});
```

`user_email` is being assigned the same value as `user_id` (both come from `frappe.session.user`, which is the username/login). The agent already gets the session via cookie and looks up the email server-side; the browser doesn't need to send it.

Note: this code path will be deleted in Phase 6 anyway when we move to socketio relay. **Do not edit it now** — it's a transient state. Phase 6's `useChat.ts` rewrite drops this branch entirely.

- [ ] **Step 2: Document the deferred fix**

(no commit needed; just verify Phase 6's rewrite drops `user_email` from the body.)

---

### Task 5.4: Phase 5 verification

- [ ] **Step 1: Rebuild**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench build --app frappe_ai 2>&1" | tail -8
```

Expected: bundle rebuilt successfully.

- [ ] **Step 2: Hard-refresh browser**

Open `http://localhost:8080/app` (or your central-site URL) → Cmd+Shift+R (Mac) / Ctrl+Shift+R (Win).

- [ ] **Step 3: Verify visual behavior**

- [ ] AI button (`message-square-text` icon) appears in the navbar (top-right area).
- [ ] Clicking the AI button opens the sidebar; `.main-section` shrinks to make room (no overlap, no scrollbars colliding).
- [ ] Clicking again closes the sidebar; `.main-section` reclaims the full remaining width.
- [ ] Pressing `Ctrl+/` toggles the sidebar (or whatever shortcut is in Settings).
- [ ] On a screen narrower than 992px, the sidebar overlays from the right with a slide animation.
- [ ] Console shows no errors.
- [ ] In dev tools → Application → Storage → confirm `<body>` has three flex children: `.body-sidebar-container`, `.main-section`, `.frappe-ai-sidebar`.

If any of the above fail, fix before Phase 6. Do not move on with broken UI mounting.

---

## Phase 6: Streaming Relay (browser ↔ Frappe ↔ agent ↔ socketio)

**What changes:** New `frappe_ai/api/chat.py` with `start_stream(message, session_id)` whitelisted method. The endpoint opens an SSE connection to the agent (using `requests` with `stream=True`), reads chunks, and republishes each chunk via `frappe.publish_realtime("frappe_ai:chat:" + session_id, chunk)`. The frontend subscribes to that event via `frappe.realtime.on(...)`. The legacy `_sendSSE` direct-fetch path and the `query()` fallback in `api/ai_query.py` are deleted, along with `setAgentUrl()` and the `_agentUrl` module variable.

### Task 6.1: Create `api/chat.py` — server-side relay

**Files:**
- Create: `frappe_ai/frappe_ai/api/chat.py`

- [ ] **Step 1: Write the relay**

```python
# frappe_ai/frappe_ai/api/chat.py
"""
Streaming chat relay.

The browser calls `start_stream` (a regular @whitelist HTTP request).
This method runs synchronously inside the Frappe worker:

  1. Opens an SSE connection to the agent (using the URL from site_config).
  2. Reads agent SSE events line-by-line.
  3. For each event, calls `frappe.publish_realtime` so the browser receives
     the chunk over its existing socketio connection.
  4. Returns when the agent stream ends (or on error).

The browser never knows the agent URL. The agent is reached via
`frappe.local.conf['frappe_ai_agent_url']`, set per-site at deploy time.
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any

import frappe
import requests
from frappe import _


def _agent_url() -> str:
	url = (frappe.local.conf or {}).get("frappe_ai_agent_url") or ""
	return url.rstrip("/")


def _publish(session_id: str, payload: dict[str, Any]) -> None:
	"""Push an event to the calling user via socketio."""
	frappe.publish_realtime(
		event=f"frappe_ai:chat:{session_id}",
		message=payload,
		user=frappe.session.user,
	)


@frappe.whitelist()
def start_stream(message: str, session_id: str | None = None) -> dict:
	"""Open an SSE stream to the agent and republish chunks via socketio.

	Args:
	    message: The user's chat message.
	    session_id: Optional client-generated session id; the agent may
	        replace it via a `session` event, in which case the new id is
	        forwarded back to the browser.

	Returns:
	    A small completion summary. The browser uses socketio events for
	    streaming; this return value just confirms the relay finished.
	"""
	if not message:
		frappe.throw(_("message is required"))

	if frappe.session.user == "Guest":
		frappe.throw(_("Authentication required"))

	url = _agent_url()
	if not url:
		frappe.throw(_("site_config['frappe_ai_agent_url'] is not set"))

	# The relay subscribes the browser to this id; if the agent renames the
	# session via a `session` event we forward the new id and let the client
	# re-subscribe.
	relay_session_id = session_id or f"local-{frappe.session.sid[:8]}-{int(time.time())}"

	payload = {
		"message": message,
		"session_id": session_id,
		"context": {
			"user_id": frappe.session.user,
			"user_email": frappe.db.get_value("User", frappe.session.user, "email"),
			"timestamp": datetime.now().isoformat(),
		},
	}

	chunks_sent = 0
	tools_called: list[str] = []
	final_session_id = session_id

	try:
		with requests.post(
			f"{url}/api/v1/chat",
			json=payload,
			cookies={"sid": frappe.session.sid},
			headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
			stream=True,
			timeout=(5, 300),
		) as resp:
			resp.raise_for_status()

			for line in resp.iter_lines(decode_unicode=True):
				if not line or not line.startswith("data: "):
					continue
				try:
					ev = json.loads(line[6:])
				except (json.JSONDecodeError, ValueError):
					continue

				ev_type = ev.get("type")
				if ev_type == "session" and ev.get("id"):
					final_session_id = ev["id"]
					_publish(relay_session_id, {"type": "session", "id": final_session_id})
				elif ev_type == "done":
					tools_called = ev.get("tools_called") or []
					_publish(relay_session_id, ev)
				else:
					_publish(relay_session_id, ev)

				chunks_sent += 1

	except requests.exceptions.Timeout:
		_publish(relay_session_id, {"type": "error", "message": "Agent timed out"})
		frappe.log_error(
			title="AI Agent Stream Timeout",
			message=f"Streaming timed out: message={message[:80]!r}",
		)
	except requests.exceptions.RequestException as exc:
		_publish(relay_session_id, {"type": "error", "message": str(exc)})
		frappe.log_error(
			title="AI Agent Stream Failed",
			message=f"Streaming failed: {exc}\nMessage: {message[:80]!r}",
		)

	return {
		"relay_session_id": relay_session_id,
		"final_session_id": final_session_id,
		"chunks_sent": chunks_sent,
		"tools_called": tools_called,
	}
```

- [ ] **Step 2: Smoke-test from console**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost console <<< 'from frappe_ai.api.chat import start_stream; print(start_stream.__doc__[:80])' 2>&1 | tail -3"
```

Expected: prints the first 80 chars of the docstring without raising.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/api/chat.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(api): chat.start_stream — server-side SSE relay via publish_realtime"
```

---

### Task 6.2: Rewrite `useChat.ts` to subscribe via socketio

**Files:**
- Modify: `frappe_ai/frappe_ai/public/js/frappe_ai/composables/useChat.ts` (major rewrite — replace the `_sendSSE` and `_sendFallback` paths with a single relay path)

- [ ] **Step 1: Replace the file contents**

Overwrite `frappe_ai/public/js/frappe_ai/composables/useChat.ts` with:

```typescript
/**
 * Message state with socketio relay.
 *
 * Flow:
 *   1. Browser calls @whitelist `frappe_ai.api.chat.start_stream`.
 *   2. The Frappe worker opens SSE to the agent, reads chunks, and
 *      calls `frappe.publish_realtime("frappe_ai:chat:" + session_id, ev)`
 *      for each event.
 *   3. Browser subscribes to that event via `frappe.realtime.on(...)` and
 *      receives chunks over its existing socketio connection.
 *
 * The browser never knows the agent URL. Same-origin only.
 */

import { ref, readonly } from "vue";
import { getPageContext } from "../utils/context";
import type { Message, ContentBlock, MessagePart } from "../types";

type SSEEvent =
  | { type: "session"; id?: string }
  | { type: "status"; message?: string }
  | { type: "tool_call"; name?: string; arguments?: Record<string, unknown>; call_id?: string }
  | { type: "content"; text?: string }
  | { type: "content_block"; block?: Record<string, unknown> }
  | { type: "done"; tools_called?: string[]; data_quality?: string }
  | { type: "error"; message?: string };

const VALID_BLOCK_TYPES = new Set(["text", "chart", "table", "kpi", "status_list"]);

function isValidBlock(block: Record<string, unknown>): boolean {
  return typeof block.type === "string" && VALID_BLOCK_TYPES.has(block.type);
}

export function useChat() {
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const canCancel = ref(false);
  const lastError = ref<string | null>(null);

  // Relay session id — the channel name we subscribe to. The agent may
  // assign its own (long-lived) session id via a `session` event; we keep
  // both: relay id for socketio subscription, agent session id for the
  // next request body.
  const relaySessionId = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  function sendMessage(content: string): void {
    if (!content.trim() || isLoading.value) return;

    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    });

    isLoading.value = true;
    lastError.value = null;

    _sendRelay(content);
  }

  function clearMessages(): void {
    messages.value = [];
    isLoading.value = false;
    lastError.value = null;
    sessionId.value = null;
    relaySessionId.value = null;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function cancelMessage(): void {
    // No client-side abort with the relay path — the request runs in a
    // worker. We surface a UI-level "stopped" signal and let the worker
    // finish in the background.
    isLoading.value = false;
    canCancel.value = false;
  }

  async function _sendRelay(content: string): Promise<void> {
    const ctx = getPageContext();
    const assistantId = crypto.randomUUID();

    messages.value.push({
      id: assistantId,
      role: "assistant",
      content: "",
      blocks: [],
      parts: [],
      timestamp: null,
      pending: true,
    });
    messages.value = [...messages.value];

    canCancel.value = true;

    try {
      // Subscribe BEFORE making the call so we don't miss early events.
      // Use a freshly-generated relay id; the server returns the actual
      // one but it should match what we computed.
      const localRelayId =
        relaySessionId.value ||
        `local-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
      relaySessionId.value = localRelayId;

      _subscribe(localRelayId, assistantId);

      const result = await new Promise<{
        relay_session_id?: string;
        final_session_id?: string | null;
      }>((resolve, reject) => {
        frappe.call<{
          relay_session_id?: string;
          final_session_id?: string | null;
        }>({
          method: "frappe_ai.api.chat.start_stream",
          args: {
            message: content,
            session_id: sessionId.value,
            // ctx is passed as part of the agent payload server-side
          },
          callback: (r) => resolve(r.message ?? {}),
          error: reject,
        });
      });

      if (result.final_session_id) {
        sessionId.value = result.final_session_id;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Stream failed";
      _removeMessage(assistantId);
      _addErrorMessage(errMsg);
    } finally {
      canCancel.value = false;
      isLoading.value = false;
    }
  }

  function _subscribe(relayId: string, assistantId: string): void {
    if (typeof frappe?.realtime?.on !== "function") return;
    const event = `frappe_ai:chat:${relayId}`;

    const handler = (ev: SSEEvent) => _handleSSEEvent(ev, assistantId);
    frappe.realtime.on(event, handler);

    unsubscribe = () => {
      if (typeof frappe?.realtime?.off === "function") {
        frappe.realtime.off(event, handler);
      }
    };
  }

  function _handleSSEEvent(ev: SSEEvent, assistantId: string): void {
    switch (ev.type) {
      case "session":
        if (typeof ev.id === "string" && ev.id) sessionId.value = ev.id;
        break;
      case "status":
        _updateMessage(assistantId, (m) => {
          m.metadata = { ...m.metadata, statusText: ev.message };
        });
        break;
      case "tool_call": {
        const tcId = crypto.randomUUID();
        const idx = messages.value.findIndex((m) => m.id === assistantId);
        const toolMsg: Message = {
          id: tcId,
          role: "tool_call",
          content: "",
          toolCall: {
            call_id: tcId,
            name: ev.name ?? "unknown",
            arguments: ev.arguments ?? {},
            success: true,
            status: "running",
          },
          timestamp: new Date(),
        };
        if (idx >= 0) messages.value.splice(idx, 0, toolMsg);
        else messages.value.push(toolMsg);
        messages.value = [...messages.value];
        break;
      }
      case "content":
        if (ev.text) {
          _updateMessage(assistantId, (m) => {
            m.content += ev.text;
            m.pending = false;
            if (!m.parts) m.parts = [];
            const last = m.parts[m.parts.length - 1];
            if (last && last.kind === "text") last.text += ev.text!;
            else m.parts.push({ kind: "text", text: ev.text! } as MessagePart);
          });
        }
        break;
      case "content_block":
        if (ev.block && isValidBlock(ev.block)) {
          const block = ev.block as unknown as ContentBlock;
          _updateMessage(assistantId, (m) => {
            if (!m.blocks) m.blocks = [];
            m.blocks.push(block);
            if (!m.parts) m.parts = [];
            m.parts.push({ kind: "block", block } as MessagePart);
            m.pending = false;
          });
        }
        break;
      case "done":
        messages.value = messages.value.map((m) => {
          if (m.role === "tool_call" && m.toolCall?.status === "running") {
            return { ...m, toolCall: { ...m.toolCall, status: "done" as const } };
          }
          return m;
        });
        _updateMessage(assistantId, (m) => {
          m.pending = false;
          m.timestamp = new Date();
          m.metadata = { ...m.metadata, statusText: undefined };
        });
        break;
      case "error":
        _removeMessage(assistantId);
        _addErrorMessage(ev.message ?? "Unknown error");
        break;
    }
  }

  function _updateMessage(id: string, updater: (m: Message) => void): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const copy = { ...messages.value[idx] };
    updater(copy);
    messages.value.splice(idx, 1, copy);
    messages.value = [...messages.value];
  }

  function _removeMessage(id: string): void {
    messages.value = messages.value.filter((m) => m.id !== id);
  }

  function _addErrorMessage(message: string): void {
    lastError.value = message;
    messages.value.push({
      id: crypto.randomUUID(),
      role: "error",
      content: message,
      error: { code: "REQUEST_FAILED", message },
      timestamp: new Date(),
    });
    messages.value = [...messages.value];
  }

  return {
    messages,
    isLoading: readonly(isLoading),
    canCancel: readonly(canCancel),
    lastError: readonly(lastError),
    sendMessage,
    cancelMessage,
    clearMessages,
  };
}
```

What changed vs Phase 1's migrated version:

- `_sendSSE` (direct-fetch) and `_sendFallback` (frappe.call → ai_query.query) are gone — single relay path.
- `setAgentUrl()` and the `_agentUrl` module variable are gone.
- `user_email` is no longer sent from the browser (server resolves it).
- Streaming is now via `frappe.realtime.on(event)` instead of fetch ReadableStream.
- `cancelMessage` is best-effort (the worker continues; the UI just stops listening).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench build --app frappe_ai 2>&1" | tail -10
```

Expected: bundle rebuilds. If TypeScript errors appear, fix them inline (likely missing types on `frappe.realtime`).

If the type defs don't include `frappe.realtime`, add to `frappe_ai/public/js/frappe_ai/types/frappe-globals.d.ts`:

```typescript
interface FrappeRealtime {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
}
```

and add `realtime: FrappeRealtime` to the existing `frappe` global declaration.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/public/js/frappe_ai/composables/useChat.ts frappe_ai/public/js/frappe_ai/types/frappe-globals.d.ts
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "feat(frontend): rewrite useChat for socketio relay; drop direct-fetch and fallback paths"
```

---

### Task 6.3: Delete legacy `query()` and `_server_agent_url()` from `api/ai_query.py`

**Files:**
- Modify: `frappe_ai/frappe_ai/api/ai_query.py`

- [ ] **Step 1: Replace contents**

Overwrite the file with:

```python
"""
Legacy API surface — `query` and `_server_agent_url` are removed.

The streaming chat path now lives in `frappe_ai.api.chat.start_stream`.
This module retains nothing; kept as a stub so existing imports don't break
during a single migration window. Delete the file in a follow-up.
"""
```

(The `test_connection` method has been moved to the Settings DocType controller in Phase 3, Task 3.4.)

- [ ] **Step 2: Verify nothing imports the deleted symbols**

```bash
grep -rn "_server_agent_url\|from frappe_ai.api.ai_query import query" /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai/ --exclude-dir=node_modules 2>/dev/null
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai add frappe_ai/api/ai_query.py
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai commit -m "refactor(api): drop legacy query()/_server_agent_url; chat lives in chat.start_stream now"
```

---

### Task 6.4: Phase 6 verification (chat works end-to-end)

- [ ] **Step 1: Confirm site_config has the agent URL**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost console <<< 'import frappe; print(frappe.local.conf.get(\"frappe_ai_agent_url\"))' 2>&1 | tail -3"
```

Expected: the URL set in Phase 3 (e.g., `http://frappe-ai-agent:8484`).

- [ ] **Step 2: Confirm the agent container is reachable from the backend**

```bash
docker exec central-site-backend bash -c "curl -sf -m 5 http://frappe-ai-agent:8484/health -o /dev/null && echo OK || echo FAIL"
```

Expected: `OK`. If `FAIL`, the agent isn't running or the hostname is wrong — fix before continuing.

- [ ] **Step 3: Restart backend + queue workers**

```bash
docker compose -f /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml --profile bench restart backend queue-short queue-long scheduler websocket
```

- [ ] **Step 4: Browser smoke test**

1. Open `http://localhost:8080/app` and log in.
2. Hard-refresh.
3. Click the AI sidebar button. Sidebar opens, `.main-section` shrinks.
4. Type a test message ("hello") and press Enter.
5. Observe in DevTools → Network: a single XHR to `/api/method/frappe_ai.api.chat.start_stream` with the message in the request body.
6. Observe in DevTools → Network → WS: socketio connection receives `frappe_ai:chat:<id>` events with content chunks.
7. The chat bubble fills in token-by-token.

- [ ] **Step 5: Confirm NOT streaming directly to the agent**

In DevTools → Network, filter by "8484" or the agent's hostname. Expected: zero requests. The browser should never speak to the agent directly anymore.

If anything fails:
- No socketio events → check that `frappe.publish_realtime` succeeds. Look in `bench logs` for the worker.
- 500 from `start_stream` → check the agent URL is reachable from inside the backend container; check `bench logs/web.log`.
- Bundle still has old code → run `bench build --app frappe_ai` and hard-refresh.

---

## Phase 7: End-to-End Verification + Central-Site Cleanup

**What changes:** Confirm `frappe_ai` works as a standalone app. Remove the `Containerfile` npm step and the `AI_AGENT_INTERNAL_URL` env var from central-site.

### Task 7.1: Standalone install verification (in central-site bench)

- [ ] **Step 1: Reinstall frappe_ai from scratch in the running bench**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost uninstall-app frappe_ai --force --yes 2>&1 | tail -8"
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench --site dev.localhost install-app frappe_ai 2>&1 | tail -8"
```

Expected: `install-app frappe_ai` runs migrations, the `after_install` hook fires and populates `agent_url`, no errors.

- [ ] **Step 2: Build and confirm**

```bash
docker exec central-site-backend bash -c "cd /home/frappe/frappe-bench && bench build --app frappe_ai 2>&1" | tail -5
```

- [ ] **Step 3: Browser-side verification**

Open `http://localhost:8080/app/ai-assistant-settings`. Confirm:
- [ ] `Enabled` is checked
- [ ] `Agent URL` is set (read-only, value matches `site_config`)
- [ ] `Sidebar Width = 380`
- [ ] `Keyboard Shortcut = Ctrl+/`

Open `http://localhost:8080/app/frappe-ai`. Confirm the Workspace shows three shortcuts.

Hard-refresh `http://localhost:8080/app`. Confirm:
- [ ] AI button in navbar
- [ ] Sidebar opens/closes; main shrinks
- [ ] Chat works end-to-end

---

### Task 7.2: Remove the npm-build workaround from central-site `Containerfile` (NO COMMIT)

**Constraint:** Do NOT commit any changes inside `/Users/sarathi/Documents/GitHub/Vyogo/central-site/`. Only the user commits there. This task edits the file in-place to verify the refactor is complete; the working tree change is left for the user to review and commit themselves.

**Files:**
- Modify (uncommitted): `/Users/sarathi/Documents/GitHub/Vyogo/central-site/Containerfile` (delete the Vite build block)

- [ ] **Step 1: Edit (no `git add`, no `git commit`)**

Find:
```dockerfile
# Build frappe_ai Vite bundle — bench build only handles traditional Frappe assets;
# the Vue/TS frontend needs its own npm run build first so its output lands in
# apps/frappe_ai/frappe_ai/public/frontend/dist/ before bench build copies it.
RUN --mount=type=cache,target=/home/frappe/.npm,uid=1000,gid=0 \
    cd apps/frappe_ai/frontend && \
    npm ci --prefer-offline && \
    npm run build && \
    cd /home/frappe/frappe-bench
```

Delete the block entirely (it's no longer needed — the bundle is built by `bench build` now).

- [ ] **Step 2: Verify the edit landed**

```bash
grep -n "frappe_ai/frontend" /Users/sarathi/Documents/GitHub/Vyogo/central-site/Containerfile
```

Expected: no output.

- [ ] **Step 3: Confirm in `git status` that the change is uncommitted**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site status Containerfile
```

Expected: `modified: Containerfile`. **Do NOT run `git add` or `git commit` in central-site.**

---

### Task 7.3: Remove `AI_AGENT_INTERNAL_URL` from `podman-compose.yml` (NO COMMIT)

**Constraint:** Same as 7.2 — edit the file but do NOT commit in central-site.

**Files:**
- Modify (uncommitted): `/Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml`

- [ ] **Step 1: Search for the env var**

```bash
grep -n "AI_AGENT_INTERNAL_URL" /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml
```

If found, delete the line(s). The same `frappe_ai_agent_url` value should already be in site_config (set in Phase 3).

- [ ] **Step 2: Verify**

```bash
grep -n "AI_AGENT_INTERNAL_URL" /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml
```

Expected: no output.

- [ ] **Step 3: Confirm uncommitted in central-site**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site status podman-compose.yml
```

Expected: `modified: podman-compose.yml`. **Do NOT run `git add` or `git commit` in central-site.**

---

### Task 7.4: Rebuild central-site without the workarounds + final verification (NO COMMIT)

- [ ] **Step 1: Rebuild the central-site image**

```bash
docker compose -f /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml --profile bench build 2>&1 | tail -10
```

Expected: image builds without the Vite step.

- [ ] **Step 2: Recreate containers**

```bash
docker compose -f /Users/sarathi/Documents/GitHub/Vyogo/central-site/podman-compose.yml --profile bench up -d 2>&1 | tail -5
```

- [ ] **Step 3: Confirm services are running**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep central-site
```

Expected: all bench services up (backend, frontend, queue-short, queue-long, scheduler, websocket).

- [ ] **Step 4: Re-verify the AI sidebar**

Browser: `http://localhost:8080/app` → AI sidebar still works post-rebuild. If yes, the standalone refactor is verified.

- [ ] **Step 5: Hand off central-site changes to the user (NO COMMIT)**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site status
```

Print the diff for the user to review:

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site diff Containerfile podman-compose.yml
```

Tell the user: "central-site `Containerfile` and `podman-compose.yml` have been edited to remove the frappe_ai workarounds. The `frappe_ai` submodule pointer is also updated. **All central-site changes are left uncommitted for you to review and commit yourself.**"

---

### Task 7.5: Frappe_ai submodule pointer in central-site (NO COMMIT)

The `frappe_ai/` submodule's HEAD has advanced because of the commits made in Phases 1-6 inside the submodule. From central-site's perspective, this shows up as a `modified: frappe_ai (new commits)` line in `git status`.

**Do NOT bump the submodule pointer with a commit in central-site.** That commit belongs to the user.

- [ ] **Step 1: Confirm the submodule shows as modified in central-site**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site status frappe_ai
```

Expected: `modified: frappe_ai (new commits)` or similar.

- [ ] **Step 2: Print a summary diff of the new submodule range**

```bash
git -C /Users/sarathi/Documents/GitHub/Vyogo/central-site/frappe_ai log --oneline origin/main..HEAD
```

Expected: a list of all the commits made in this refactor (Phases 1-6).

- [ ] **Step 3: Hand off to the user**

Tell the user: "The `frappe_ai` submodule has new commits from this refactor. The submodule pointer in central-site is left for you to bump and commit yourself when you're ready, along with the Containerfile / podman-compose.yml changes."

- [ ] **Step 4: Final smoke test**

Repeat Task 7.1 Step 3 in browser. Everything should still work.

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| Build pipeline → Path A (Frappe native bundle) | Phase 1 (Tasks 1.1-1.11) |
| Delete `update-hooks.js` | Phase 1, Task 1.10 |
| Delete `setup.py` / `MANIFEST.in` / `requirements.txt` | Phase 2, Task 2.2 |
| Replace `config/desktop.py` with Workspace fixture | Phase 4, Tasks 4.1-4.2 |
| Sync publisher across pyproject + hooks | Phase 2, Tasks 2.1, 2.3 |
| Drop `user_email` field from request body | Phase 6, Task 6.2 (subsumes Phase 5 deferred) |
| `after_install` reads site_config | Phase 3, Tasks 3.1-3.2 |
| Replace DOM polling with `app_ready` | Phase 5, Task 5.1 |
| Streaming via Frappe socketio relay | Phase 6, Tasks 6.1-6.2 |
| Wire `frappe.ui.keys.add_shortcut` | Phase 5, Task 5.1 (`bindShortcut`) |
| Validate keyboard shortcut format | Phase 3, Task 3.4 (Settings.validate) |
| Build version stamp via build-arg / VERSION file | **NOT in this plan** — covered by deleting the inline `git rev-parse` attempt in Task 1.10 (deleting frontend/vite.config.js eliminates the dead code). The "build SHA" feature is no longer load-bearing once update-hooks.js is gone — Frappe's bundler handles cache-busting via filename hashing. If a build stamp is wanted later, add it as a follow-up. |
| v16-only sidebar mounting + flex sibling | Phase 5, Task 5.1 + 5.2 |
| `agent_url` read-only from site_config | Phase 3, Tasks 3.3-3.4 |

---

## Execution Handoff

**Plan complete and saved to `frappe_ai/docs/superpowers/plans/2026-05-09-frappe-native-refactor.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
