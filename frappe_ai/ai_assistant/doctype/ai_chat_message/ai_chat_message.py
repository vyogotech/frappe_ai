# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class AIChatMessage(Document):
	def before_insert(self):
		if not self.created_at:
			self.created_at = frappe.utils.now_datetime()

	def validate(self):
		# the Link only checks that the session exists; its own permissions decide who may write into it
		frappe.get_doc("AI Chat Session", self.session).check_permission("write")
		# `self.get_doc_before_save()` returns None on insert and the persisted version on update
		if self.get_doc_before_save() is None:
			self._refuse_a_repeat_of_the_last_row()

	def _refuse_a_repeat_of_the_last_row(self):
		"""Throw DuplicateEntryError (409) unless this row says something the row before it did not."""
		# One turn writes one row of each role. A second writer's copy of a row this chat already holds
		# arrives as an exact repeat of the row before it, and an honest turn never does: the answer to
		# a resent question always sits between the two copies of the question.
		last = frappe.get_all(
			"AI Chat Message",
			filters={"session": self.session},
			fields=["role", "content"],
			order_by="creation desc",
			limit=1,
		)
		if last and last[0].role == self.role and (last[0].content or "") == (self.content or ""):
			frappe.throw(_("This message repeats the last one in this chat."), frappe.DuplicateEntryError)
