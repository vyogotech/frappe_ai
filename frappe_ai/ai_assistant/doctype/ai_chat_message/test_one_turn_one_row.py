"""One turn writes one row of each role, whichever writer sends it (ADR-011)."""

import frappe
from frappe.tests import IntegrationTestCase


class TestARowDoesNotRepeatTheOneBeforeIt(IntegrationTestCase):
	def setUp(self):
		self.chat = frappe.get_doc(
			{"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)}
		).insert()
		self.addCleanup(frappe.delete_doc, "AI Chat Session", self.chat.name, force=True)

	def _row(self, role, content):
		return frappe.get_doc(
			{"doctype": "AI Chat Message", "session": self.chat.name, "role": role, "content": content}
		).insert()

	def test_a_second_writers_copy_of_the_question_is_refused(self):
		self._row("user", "what is the total")
		with self.assertRaises(frappe.DuplicateEntryError):
			self._row("user", "what is the total")
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": self.chat.name, "role": "user"}), 1)

	def test_the_same_question_asked_again_after_an_answer_is_kept(self):
		self._row("user", "what is the total")
		self._row("assistant", "1,240.00")
		self._row("user", "what is the total")
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": self.chat.name, "role": "user"}), 2)

	def test_the_same_text_from_the_other_role_is_kept(self):
		self._row("user", "1,240.00")
		self._row("assistant", "1,240.00")
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": self.chat.name}), 2)

	def test_a_repeat_in_another_chat_is_kept(self):
		other = frappe.get_doc(
			{"doctype": "AI Chat Session", "name": frappe.generate_hash(length=12)}
		).insert()
		self.addCleanup(frappe.delete_doc, "AI Chat Session", other.name, force=True)
		self._row("user", "what is the total")
		frappe.get_doc(
			{
				"doctype": "AI Chat Message",
				"session": other.name,
				"role": "user",
				"content": "what is the total",
			}
		).insert()
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": other.name}), 1)

	def test_the_rule_is_for_new_rows_only_and_does_not_fire_on_a_save(self):
		row = self._row("assistant", "1,240.00")
		row.tool_result_json = '{"sources": [], "blocks": [], "usage": {"output_tokens": 31}}'
		row.save()
		self.assertEqual(frappe.db.count("AI Chat Message", {"session": self.chat.name}), 1)
