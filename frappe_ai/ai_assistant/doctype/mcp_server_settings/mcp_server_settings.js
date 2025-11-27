// Copyright (c) 2024, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on('MCP Server Settings', {
	refresh: function(frm) {
		// Add custom button to test connection
		if (!frm.is_new()) {
			frm.add_custom_button(__('Test Connection'), function() {
				test_mcp_connection(frm);
			});
			
			frm.add_custom_button(__('Clear Token Cache'), function() {
				clear_token_cache(frm);
			});
		}
		
		// Add help text
		if (frm.doc.enabled) {
			frm.dashboard.set_headline_alert(
				'MCP AI Assistant is enabled. Use the Awesome Bar to ask questions!',
				'green'
			);
		} else {
			frm.dashboard.set_headline_alert(
				'MCP AI Assistant is disabled. Enable it to start using AI features.',
				'orange'
			);
		}
	},
	
	enabled: function(frm) {
		if (frm.doc.enabled) {
			frappe.show_alert({
				message: __('MCP AI Assistant enabled'),
				indicator: 'green'
			});
		}
	}
});

function test_mcp_connection(frm) {
	frappe.dom.freeze(__('Testing connection...'));
	
	frappe.call({
		method: 'frappe_ai.api.ai_query.test_connection',
		callback: function(r) {
			frappe.dom.unfreeze();
			
			if (r.message && r.message.success) {
				frappe.show_alert({
					message: __('Connection successful! ') + r.message.message,
					indicator: 'green'
				}, 5);
				
				frappe.msgprint({
					title: __('Connection Test Successful'),
					message: r.message.message,
					indicator: 'green'
				});
			} else {
				let error_msg = r.message ? r.message.message : 'Unknown error';
				frappe.show_alert({
					message: __('Connection failed: ') + error_msg,
					indicator: 'red'
				}, 5);
				
				frappe.msgprint({
					title: __('Connection Test Failed'),
					message: error_msg,
					indicator: 'red'
				});
			}
		},
		error: function(err) {
			frappe.dom.unfreeze();
			frappe.msgprint({
				title: __('Connection Test Failed'),
				message: __('An error occurred while testing the connection. Please check the console for details.'),
				indicator: 'red'
			});
		}
	});
}

function clear_token_cache(frm) {
	frappe.call({
		method: 'frappe_ai.api.ai_query.clear_token_cache',
		callback: function(r) {
			if (r.message) {
				frappe.show_alert({
					message: __('Token cache cleared successfully'),
					indicator: 'green'
				});
			}
		}
	});
}

