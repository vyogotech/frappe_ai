from . import __version__ as app_version

app_name = "frappe_ai"
app_title = "Frappe AI"
app_publisher = "Frappe"
app_description = "AI Assistant Integration for Frappe/ERPNext using MCP Server"
app_email = "developers@frappe.io"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/frappe_ai/css/frappe_ai_sidebar.css?v=651f3697"
app_include_js = "/assets/frappe_ai/frontend/dist/js/frappe_ai.js?v=94fa5b48"

# include js, css files in header of web template
# web_include_css = "/assets/frappe_ai/css/frappe_ai.css"
# web_include_js = "/assets/frappe_ai/js/frappe_ai.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "frappe_ai/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# "Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# "methods": "frappe_ai.utils.jinja_methods",
# "filters": "frappe_ai.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "frappe_ai.install.before_install"
# after_install = "frappe_ai.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "frappe_ai.uninstall.before_uninstall"
# after_uninstall = "frappe_ai.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "frappe_ai.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# "Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# "Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# "ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# "*": {
# "on_update": "method",
# "on_cancel": "method",
# "on_trash": "method"
# }
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# "all": [
# "frappe_ai.tasks.all"
# ],
# "daily": [
# "frappe_ai.tasks.daily"
# ],
# "hourly": [
# "frappe_ai.tasks.hourly"
# ],
# "weekly": [
# "frappe_ai.tasks.weekly"
# ],
# "monthly": [
# "frappe_ai.tasks.monthly"
# ],
# }

# Testing
# -------

# before_tests = "frappe_ai.install.before_tests"

# Overriding Methods
# ------------------------------
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# "Task": "frappe_ai.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["frappe_ai.utils.before_request"]
# after_request = ["frappe_ai.utils.after_request"]

# Job Events
# ----------
# before_job = ["frappe_ai.utils.before_job"]
# after_job = ["frappe_ai.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# {
# "doctype": "{doctype_1}",
# "filter_by": "{filter_by}",
# "redact_fields": ["{field_1}", "{field_2}"],
# "partial": 1,
# },
# {
# "doctype": "{doctype_2}",
# "filter_by": "{filter_by}",
# "partial": 1,
# },
# {
# "doctype": "{doctype_3}",
# "strict": False,
# },
# {
# "doctype": "{doctype_4}"
# }
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# "frappe_ai.auth.validate"
# ]
