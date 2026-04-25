# Copyright (c) 2024, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AIAssistantSettings(Document):
	def validate(self):
		if self.agent_url:
			self.agent_url = self.agent_url.rstrip("/")

		if self.timeout is not None:
			if self.timeout < 1:
				frappe.throw("Timeout must be at least 1 second")
			if self.timeout > 300:
				frappe.throw("Timeout cannot exceed 300 seconds (5 minutes)")
