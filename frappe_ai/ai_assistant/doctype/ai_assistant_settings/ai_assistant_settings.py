# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


class AIAssistantSettings(Document):
	def before_save(self):
		# The agent URL is authoritative in site_config.json (frappe_ai_agent_url).
		# The APIs read it from there directly. This field is read-only display
		# that refreshes on every save so the form always shows the live value.
		conf_url = frappe.local.conf.get("frappe_ai_agent_url", "")
		self.agent_url = conf_url.rstrip("/") if conf_url else ""

	def validate(self):
		if self.timeout is not None and (self.timeout < 1 or self.timeout > 300):
			frappe.throw(frappe._("Timeout must be between 1 and 300 seconds."))
		if self.sidebar_width is not None and (self.sidebar_width < 300 or self.sidebar_width > 600):
			frappe.throw(frappe._("Sidebar width must be between 300 and 600 pixels."))
		if self.keyboard_shortcut:
			_validate_shortcut(self.keyboard_shortcut)


_RESERVED_SHORTCUTS = {
	# Frappe v16 hard-binds these in the desk; binding the AI toggle to any of
	# them swallows the keystroke and toggles the wrong thing instead.
	"ctrl+/",  # Toggle left workspace sidebar
	"ctrl+k",  # Toggle Awesomebar
	"ctrl+g",  # Open Awesomebar
	"ctrl+s",  # Trigger Primary Action
	"alt+s",  # Open Settings
	"shift+/",  # Show Keyboard Shortcuts
}


def _validate_shortcut(shortcut: str) -> None:
	"""Accept modifier+key combos: e.g. Alt+/, Mod+Shift+A, Alt+;

	Rejects shortcuts already claimed by Frappe v16 (Ctrl+/, Ctrl+K, etc.) —
	the OS still delivers the keystroke, but Frappe's handler runs first and
	the AI toggle never fires.
	"""
	pattern = r"^(Mod|Ctrl|Alt|Shift)(\+(Mod|Ctrl|Alt|Shift))*\+\S$"
	if not re.match(pattern, shortcut, re.IGNORECASE):
		frappe.throw(frappe._("Invalid keyboard shortcut format. Use e.g. Alt+/ or Mod+Shift+A."))
	if shortcut.lower() in _RESERVED_SHORTCUTS:
		frappe.throw(
			frappe._("{0} is reserved by Frappe; pick a different combo (e.g. Alt+/, Mod+Shift+A).").format(
				shortcut
			)
		)
