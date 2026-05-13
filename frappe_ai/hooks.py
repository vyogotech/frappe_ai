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
app_include_js = ["frappe_ai.bundle.ts"]

# Bootstrap the AI Assistant Settings singleton on first install and after
# every migrate so the doctype is always present.
after_install = "frappe_ai.install.after_install"
after_migrate = "frappe_ai.install.after_migrate"
