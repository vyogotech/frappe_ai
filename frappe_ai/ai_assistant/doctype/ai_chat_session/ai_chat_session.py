# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AIChatSession(Document):
    def before_insert(self):
        if not self.user:
            self.user = frappe.session.user
        if not self.started_at:
            self.started_at = frappe.utils.now_datetime()
        if not self.last_activity:
            self.last_activity = self.started_at
