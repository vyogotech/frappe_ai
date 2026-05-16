from . import __version__ as app_version

app_name = "frappe_ai"
app_title = "Frappe AI"
app_publisher = "Vyogo"
app_description = "In-desk AI assistant for Frappe/ERPNext — streams responses from a configured AI agent into a chat sidebar."
app_email = "developers@vyogo.com"
app_license = "MIT"

# Bundled by Frappe's esbuild (the `.bundle.` suffix is the trigger).
# Output lands in /assets/frappe_ai/dist/... with content-hashed filenames,
# so no manual cache-busting is needed.
app_include_css = ["frappe_ai_sidebar.bundle.css"]
# The value must match the source filename, NOT a `.js` rewrite. v16's
# esbuild writes `assets.json` keys from `info.entryPoint` (the source path)
# in `apps/frappe/esbuild/esbuild.js:442-454`, so a `.bundle.ts` source
# produces a `.bundle.ts` key. Verified live: `assets.json` shows
# `"frappe_ai.bundle.ts": "/assets/frappe_ai/dist/js/frappe_ai.bundle.HASH.js"`.
# Writing `.bundle.js` here misses the lookup and falls through to a
# literal `/frappe_ai.bundle.js` URL that 404s.
app_include_js = ["frappe_ai.bundle.ts"]

# Bootstrap the AI Assistant Settings singleton on first install and after
# every migrate so the doctype is always present.
after_install = "frappe_ai.install.after_install"
after_migrate = "frappe_ai.install.after_migrate"

# Cross-tab sync (BUG-004): broadcast inserted messages so other tabs
# subscribed to the same session can append without polling. The handler
# itself does a best-effort `frappe.publish_realtime`; any failure is logged.
doc_events = {
    "AI Chat Message": {
        "after_insert": "frappe_ai.api.realtime.broadcast_message_added",
    },
}
