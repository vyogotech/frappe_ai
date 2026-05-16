# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

# Fields that must never change after the session row is created. The DocType
# JSON allows System Manager to write everything, but BUG-010 showed that lets
# an admin reassign a session to another user or rewrite its grounding
# context_json — both serious integrity holes that the API would never
# generate. We enforce immutability here so the Python layer is the floor,
# regardless of role.
_IMMUTABLE_AFTER_INSERT = ("user", "context_json")


class AIChatSession(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user
		if not self.started_at:
			self.started_at = frappe.utils.now_datetime()
		if not self.last_activity:
			self.last_activity = self.started_at

	def validate(self):
		# `self.get_doc_before_save()` returns None on insert and the persisted
		# version on update — exactly the discriminator we need.
		previous = self.get_doc_before_save()
		if previous is None:
			return
		for fieldname in _IMMUTABLE_AFTER_INSERT:
			old = previous.get(fieldname)
			new = self.get(fieldname)
			if old != new:
				frappe.throw(
					_("Field '{0}' on AI Chat Session is read-only after creation.").format(fieldname),
					frappe.ValidationError,
				)
