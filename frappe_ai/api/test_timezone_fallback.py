# Copyright (c) 2026, Vyogo and contributors
# For license information, please see license.txt

"""A System Settings time zone this host cannot resolve moves every chat timestamp, so it is logged."""

import datetime as dt
import unittest
from unittest.mock import patch

import frappe

from frappe_ai.api import chat


class TestTimeZoneFallbackIsLogged(unittest.TestCase):
	naive = dt.datetime(2026, 1, 2, 3, 4, 5)

	def setUp(self):
		chat._system_tzinfo.cache_clear()
		self.addCleanup(chat._system_tzinfo.cache_clear)

	def test_an_unresolvable_time_zone_is_logged_once_however_many_messages_carry_it(self):
		with (
			patch("frappe.utils.get_system_timezone", return_value="Asia/Calcutta_TYPO"),
			patch.object(frappe, "logger") as logger,
		):
			for _ in range(3):
				self.assertEqual(chat._to_iso_utc(self.naive), "2026-01-02T03:04:05Z")
		self.assertEqual(logger.return_value.warning.call_count, 1)
		self.assertIn("Asia/Calcutta_TYPO", str(logger.return_value.warning.call_args))

	def test_an_empty_time_zone_is_logged_too(self):
		with (
			patch("frappe.utils.get_system_timezone", return_value=""),
			patch.object(frappe, "logger") as logger,
		):
			chat._to_iso_utc(self.naive)
		self.assertEqual(logger.return_value.warning.call_count, 1)

	def test_a_time_zone_this_host_resolves_is_not_logged(self):
		with (
			patch("frappe.utils.get_system_timezone", return_value="Asia/Kolkata"),
			patch.object(frappe, "logger") as logger,
		):
			self.assertEqual(chat._to_iso_utc(self.naive), "2026-01-01T21:34:05Z")
		logger.return_value.warning.assert_not_called()
