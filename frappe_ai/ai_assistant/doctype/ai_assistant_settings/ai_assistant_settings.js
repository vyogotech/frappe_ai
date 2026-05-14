// Copyright (c) 2026, Vyogo and contributors
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
		method: 'frappe_ai.api.health.test_connection',
		callback: function(r) {
			frappe.dom.unfreeze();

			if (r.message && r.message.success) {
				// Single non-blocking toast; no modal stacked on top.
				frappe.show_alert({
					message: __('Connection successful. The AI agent is reachable.'),
					indicator: 'green'
				}, 5);
			} else {
				const error_msg = r.message ? r.message.message : __('Unknown error');
				// Failures are surfaced as a modal so the message can't be missed
				// (the agent URL is read-only — user can't fix it from here, but
				// at least they know to escalate).
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
