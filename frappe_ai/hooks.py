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
# .ts, not .js: esbuild keys assets.json by the source entry point, so a .js name 404s (frappe/esbuild/esbuild.js)
app_include_js = ["frappe_ai.bundle.ts"]

# other tabs on the same session append these messages instead of polling
doc_events = {
	"AI Chat Message": {
		"after_insert": "frappe_ai.api.realtime.broadcast_message_added",
	},
}

# a Personal Data Deletion Request redacts these and a personal data download includes them
user_data_fields = [
	{"doctype": "AI Chat Session", "filter_by": "user", "redact_fields": ["title", "context_json"]},
	{
		"doctype": "AI Chat Message",
		"filter_by": "owner",
		"redact_fields": ["content", "tool_args_json", "tool_result_json"],
	},
]
