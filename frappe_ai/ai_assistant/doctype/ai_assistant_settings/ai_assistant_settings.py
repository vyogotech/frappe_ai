# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


class AIAssistantSettings(Document):
	def onload(self):
		# Frappe hides an empty read-only field, so without this the agent URL shows only after a Save
		self._sync_agent_url_from_conf()

	def before_save(self):
		# Same sync runs on save so a manual edit (or an out-of-band
		# site_config change between load and save) can't desync the
		# displayed value from the authoritative one.
		self._sync_agent_url_from_conf()

	def _sync_agent_url_from_conf(self) -> None:
		conf_url = frappe.local.conf.get("frappe_ai_agent_url", "")
		self.agent_url = conf_url.rstrip("/") if conf_url else ""

	def agent_timeout(self) -> int:
		"""Seconds the relay gives the agent: this setting, or the field's own default while it is unset."""
		return int(self.timeout or self.meta.get_field("timeout").default)

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
	"""Throw unless shortcut is modifiers plus one key (Alt+/, Mod+Shift+A) and not one the desk binds."""
	pattern = r"^(Mod|Ctrl|Alt|Shift)(\+(Mod|Ctrl|Alt|Shift))*\+\S$"
	if not re.match(pattern, shortcut, re.IGNORECASE):
		frappe.throw(frappe._("Invalid keyboard shortcut format. Use e.g. Alt+/ or Mod+Shift+A."))
	if shortcut.lower() in _RESERVED_SHORTCUTS:
		frappe.throw(
			frappe._("{0} is reserved by Frappe; pick a different combo (e.g. Alt+/, Mod+Shift+A).").format(
				shortcut
			)
		)
