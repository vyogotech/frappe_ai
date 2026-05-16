// Copyright (c) 2026, Vyogo and contributors
// For license information, please see license.txt

frappe.ui.form.on('AI Assistant Settings', {
	refresh: function(frm) {
		if (!frm.is_new()) {
			// OBS-016: closure-scoped flag prevents stacked toasts and
			// hammering the agent when the user mashes the button. The
			// flag clears in test_agent_connection's settled() callback.
			let test_in_flight = false;
			frm.add_custom_button(__('Test Connection'), function() {
				if (test_in_flight) return;
				test_in_flight = true;
				test_agent_connection(frm, () => { test_in_flight = false; });
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

function test_agent_connection(frm, on_settled) {
	frappe.dom.freeze(__('Testing connection...'));

	const settled = () => {
		frappe.dom.unfreeze();
		if (typeof on_settled === 'function') on_settled();
	};

	frappe.call({
		method: 'frappe_ai.api.health.test_connection',
		callback: function(r) {
			settled();

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
			settled();
			frappe.msgprint({
				title: __('Connection Test Failed'),
				message: __('An error occurred while testing the connection. Please check the console for details.'),
				indicator: 'red'
			});
		}
	});
}
