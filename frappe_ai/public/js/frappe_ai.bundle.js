/**
 * Frappe AI Bundle
 * Main JavaScript bundle for AI integration
 */

frappe.provide('frappe_ai');

// Awesome Bar Integration - responds to @ai command
$(document).on('app_ready', function() {
	console.log('Frappe AI: Awesome Bar integration loaded');
	
	// Search results will navigate to /ai-chat page automatically
	// No need to intercept clicks - let Frappe handle the navigation
});

// AI Query Dialog
frappe_ai.show_ai_dialog = function(query) {
	let d = new frappe.ui.Dialog({
		title: __('AI Assistant'),
		size: 'large',
		fields: [
			{
				fieldname: 'query',
				fieldtype: 'Data',
				label: __('Your Question'),
				default: query,
				reqd: 1
			},
			{
				fieldname: 'result',
				fieldtype: 'HTML',
				options: `<div class="ai-result-container">
					<div class="text-center text-muted" style="padding: 40px;">
						<i class="fa fa-robot" style="font-size: 48px; margin-bottom: 20px; display: block; opacity: 0.3;"></i>
						<p>${__('Ask me anything about your ERPNext data')}</p>
					</div>
				</div>`
			}
		],
		primary_action_label: __('Ask AI'),
		primary_action: function(values) {
			if (!values.query) {
				frappe.msgprint(__('Please enter a question'));
				return;
			}
			
			// Show loading state
			d.fields_dict.result.$wrapper.html(`
				<div class="ai-result-container">
					<div class="text-center" style="padding: 40px;">
						<i class="fa fa-spinner fa-spin" style="font-size: 36px; margin-bottom: 20px; display: block;"></i>
						<p class="text-muted">${__('Thinking...')}</p>
					</div>
				</div>
			`);
			
			// Call AI query API
			frappe.call({
				method: 'frappe_ai.api.ai_query.query',
				args: { message: values.query },
				callback: (r) => {
					if (r.message) {
						let response = r.message.response || r.message.message || JSON.stringify(r.message);
						
						// Format and display response
						d.fields_dict.result.$wrapper.html(`
							<div class="ai-result-container" style="padding: 20px; max-height: 500px; overflow-y: auto;">
								<div class="ai-response">
									${frappe.markdown(response)}
								</div>
							</div>
						`);
						
						// Update dialog title
						d.set_title(__('AI Response'));
						
						// Add copy button
						d.set_secondary_action(() => {
							frappe.utils.copy_to_clipboard(response);
							frappe.show_alert({
								message: __('Response copied to clipboard'),
								indicator: 'green'
							});
						});
						d.set_secondary_action_label(__('Copy'));
					}
				},
				error: (err) => {
					d.fields_dict.result.$wrapper.html(`
						<div class="ai-result-container" style="padding: 20px;">
							<div class="alert alert-danger">
								<strong>${__('Error')}</strong><br>
								${__('Failed to query AI assistant. Please check your MCP Server Settings and try again.')}
							</div>
						</div>
					`);
				}
			});
		}
	});
	
	d.show();
	
	// Add custom styling
	d.$wrapper.find('.modal-dialog').css('max-width', '800px');
};

// Add AI button to navbar (optional)
frappe.ui.toolbar.add_button = function() {
	// Add AI assistant button to toolbar
	if (frappe.session.user !== 'Guest') {
		$('<li class="nav-item dropdown dropdown-help dropdown-mobile-header">')
			.html(`
				<a class="nav-link" href="#" onclick="frappe_ai.show_ai_dialog(''); return false;" 
				   title="${__('AI Assistant')}">
					<span class="navbar-icon-container">
						<svg class="icon icon-md" style="">
							<use href="#icon-ai"></use>
						</svg>
					</span>
				</a>
			`)
			.insertBefore('.navbar-home');
	}
};

// Initialize when document is ready
$(document).ready(function() {
	// Add custom CSS
	$('<style>')
		.html(`
			.ai-result-container {
				background: var(--control-bg);
				border-radius: 8px;
				min-height: 200px;
			}
			
			.ai-response {
				line-height: 1.6;
			}
			
			.ai-response h1,
			.ai-response h2,
			.ai-response h3 {
				margin-top: 1em;
				margin-bottom: 0.5em;
			}
			
			.ai-response pre {
				background: var(--bg-color);
				padding: 12px;
				border-radius: 4px;
				overflow-x: auto;
			}
			
			.ai-response table {
				width: 100%;
				margin: 1em 0;
			}
			
			.ai-response ul,
			.ai-response ol {
				margin-left: 1.5em;
			}
		`)
		.appendTo('head');
});

// Export for use in other modules
window.frappe_ai = frappe_ai;

