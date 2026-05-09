import frappe


def after_install():
    _ensure_settings()


def after_migrate():
    _ensure_settings()


def _ensure_settings():
    agent_url = frappe.local.conf.get("frappe_ai_agent_url", "")
    if frappe.db.exists("AI Assistant Settings", "AI Assistant Settings"):
        doc = frappe.get_doc("AI Assistant Settings", "AI Assistant Settings")
        doc.agent_url = agent_url
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.new_doc("AI Assistant Settings")
        doc.agent_url = agent_url
        doc.insert(ignore_permissions=True)
    frappe.db.commit()
