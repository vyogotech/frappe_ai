(() => {
  // ../frappe_ai/frappe_ai/public/js/frappe_ai.bundle.js
  frappe.provide("frappe_ai");
  $(document).on("app_ready", function() {
    console.log("Frappe AI: Awesome Bar integration loaded");
  });
  frappe_ai.show_ai_dialog = function(query) {
    let d = new frappe.ui.Dialog({
      title: __("AI Assistant"),
      size: "large",
      fields: [
        {
          fieldname: "query",
          fieldtype: "Data",
          label: __("Your Question"),
          default: query,
          reqd: 1
        },
        {
          fieldname: "result",
          fieldtype: "HTML",
          options: `<div class="ai-result-container">
					<div class="text-center text-muted" style="padding: 40px;">
						<i class="fa fa-robot" style="font-size: 48px; margin-bottom: 20px; display: block; opacity: 0.3;"></i>
						<p>${__("Ask me anything about your ERPNext data")}</p>
					</div>
				</div>`
        }
      ],
      primary_action_label: __("Ask AI"),
      primary_action: function(values) {
        if (!values.query) {
          frappe.msgprint(__("Please enter a question"));
          return;
        }
        d.fields_dict.result.$wrapper.html(`
				<div class="ai-result-container">
					<div class="text-center" style="padding: 40px;">
						<i class="fa fa-spinner fa-spin" style="font-size: 36px; margin-bottom: 20px; display: block;"></i>
						<p class="text-muted">${__("Thinking...")}</p>
					</div>
				</div>
			`);
        frappe.call({
          method: "frappe_ai.api.ai_query.query",
          args: { message: values.query },
          callback: (r) => {
            if (r.message) {
              let response = r.message.response || r.message.message || JSON.stringify(r.message);
              d.fields_dict.result.$wrapper.html(`
							<div class="ai-result-container" style="padding: 20px; max-height: 500px; overflow-y: auto;">
								<div class="ai-response">
									${frappe.markdown(response)}
								</div>
							</div>
						`);
              d.set_title(__("AI Response"));
              d.set_secondary_action(() => {
                frappe.utils.copy_to_clipboard(response);
                frappe.show_alert({
                  message: __("Response copied to clipboard"),
                  indicator: "green"
                });
              });
              d.set_secondary_action_label(__("Copy"));
            }
          },
          error: (err) => {
            d.fields_dict.result.$wrapper.html(`
						<div class="ai-result-container" style="padding: 20px;">
							<div class="alert alert-danger">
								<strong>${__("Error")}</strong><br>
								${__("Failed to query AI assistant. Please check your MCP Server Settings and try again.")}
							</div>
						</div>
					`);
          }
        });
      }
    });
    d.show();
    d.$wrapper.find(".modal-dialog").css("max-width", "800px");
  };
  frappe.ui.toolbar.add_button = function() {
    if (frappe.session.user !== "Guest") {
      $('<li class="nav-item dropdown dropdown-help dropdown-mobile-header">').html(`
				<a class="nav-link" href="#" onclick="frappe_ai.show_ai_dialog(''); return false;" 
				   title="${__("AI Assistant")}">
					<span class="navbar-icon-container">
						<svg class="icon icon-md" style="">
							<use href="#icon-ai"></use>
						</svg>
					</span>
				</a>
			`).insertBefore(".navbar-home");
    }
  };
  $(document).ready(function() {
    $("<style>").html(`
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
		`).appendTo("head");
  });
  window.frappe_ai = frappe_ai;
})();
//# sourceMappingURL=frappe_ai.bundle.DUPYLAW5.js.map
