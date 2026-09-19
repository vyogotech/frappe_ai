# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AIChatMessage(Document):
	def before_insert(self):
		if not self.created_at:
			self.created_at = frappe.utils.now_datetime()

	def validate(self):
		# the Link only checks that the session exists; its own permissions decide who may write into it
		frappe.get_doc("AI Chat Session", self.session).check_permission("write")
