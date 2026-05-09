# Copyright (c) 2024, Frappe and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


class AIAssistantSettings(Document):
    def before_save(self):
        # Always reflect current site_config value — UI field is display-only
        self.agent_url = frappe.local.conf.get("frappe_ai_agent_url", "")

    def validate(self):
        if self.keyboard_shortcut:
            _validate_shortcut(self.keyboard_shortcut)


def _validate_shortcut(shortcut: str) -> None:
    """Accept 'Mod+key', 'Ctrl+key', 'Alt+key', 'Shift+key' combos."""
    pattern = r"^(Mod|Ctrl|Alt|Shift)(\+(Mod|Ctrl|Alt|Shift))*\+\w+$"
    if not re.match(pattern, shortcut, re.IGNORECASE):
        frappe.throw(
            frappe._("Invalid keyboard shortcut format. Use e.g. Ctrl+/ or Mod+Shift+A.")
        )
