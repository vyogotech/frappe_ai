// Copyright (c) 2024, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on('AI Assistant Settings', {
	refresh: function(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Test Connection'), function() {
				test_agent_connection(frm);
			});
		}

		if (frm.doc.enabled) {
			frm.dashboard.set_headline_alert(
				__('AI Assistant is enabled. Open the sidebar to start chatting.'),
				'green'
			);
		} else {
			frm.dashboard.set_headline_alert(
				__('AI Assistant is disabled. Enable it to start using AI features.'),
				'orange'
			);
		}
	},

	enabled: function(frm) {
		if (frm.doc.enabled) {
			frappe.show_alert({
				message: __('AI Assistant enabled'),
				indicator: 'green'
			});
		}
	}
});

function test_agent_connection(frm) {
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
				const error_msg = r.message ? r.message.message : 'Unknown error';
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
		error: function() {
			frappe.dom.unfreeze();
			frappe.msgprint({
				title: __('Connection Test Failed'),
				message: __('An error occurred while testing the connection. Please check the console for details.'),
				indicator: 'red'
			});
		}
	});
}
