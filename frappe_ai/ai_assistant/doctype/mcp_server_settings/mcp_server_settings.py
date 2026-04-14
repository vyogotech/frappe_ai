# Copyright (c) 2024, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MCPServerSettings(Document):
	"""MCP Server Settings DocType"""
	
	def validate(self):
		"""Validate MCP Server Settings"""
		self.validate_urls()
		self.validate_timeout()
	
	def validate_urls(self):
		"""Validate that URLs are properly formatted"""
		if self.agent_url:
			self.agent_url = self.agent_url.rstrip('/')
	
	def validate_timeout(self):
		"""Validate timeout value"""
		if self.timeout and self.timeout < 1:
			frappe.throw("Timeout must be at least 1 second")
		
		if self.timeout and self.timeout > 300:
			frappe.throw("Timeout cannot exceed 300 seconds (5 minutes)")
	
	def on_update(self):
		"""Clear token cache when settings are updated"""
		try:
			from frappe_ai.api.ai_query import clear_token_cache
			clear_token_cache()
		except:
			pass

