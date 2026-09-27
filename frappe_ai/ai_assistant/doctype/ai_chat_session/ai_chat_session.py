# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

# the DocType lets System Manager write every field; this is the only guard against reassigning a session
# or rewriting its grounding context after insert
_IMMUTABLE_AFTER_INSERT = ("user", "context_json")


class AIChatSession(Document):
	def before_insert(self):
		# a caller-supplied user would put this chat in someone else's sidebar
		self.user = frappe.session.user
		if not self.last_activity:
			# the chat list orders on this, so a session without one would sort last from the moment it opens
			self.last_activity = frappe.utils.now_datetime()

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

	def on_trash(self):
		# messages link to their session, so they go first; whoever may delete the chat may delete them
		for name in frappe.get_all("AI Chat Message", filters={"session": self.name}, pluck="name"):
			frappe.delete_doc("AI Chat Message", name, ignore_permissions=True)
