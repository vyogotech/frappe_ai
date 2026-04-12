"""
AI Query API — sid cookie authentication to MCP server.
"""
import frappe
import requests
from datetime import datetime
from frappe import _


@frappe.whitelist()
def query(message):
    """
    Send a message to the MCP server using the user's sid cookie.

    Args:
        message (str): The query/message to send to the AI assistant

    Returns:
        dict: Response from MCP server containing AI-generated answer
    """
    if not message:
        frappe.throw(_("Message is required"))

    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Authentication required"))

    user_email = frappe.db.get_value("User", user, "email")
    settings = frappe.get_single("MCP Server Settings")

    if not settings.enabled:
        frappe.throw(_("MCP integration is not enabled"))

    sid = frappe.session.sid

    payload = {
        "message": message,
        "context": {
            "user_id": user,
            "user_email": user_email,
            "timestamp": datetime.now().isoformat(),
        },
    }

    try:
        response = requests.post(
            f"{settings.mcp_server_url}/api/v1/chat",
            json=payload,
            cookies={"sid": sid},
            headers={"Content-Type": "application/json"},
            timeout=settings.timeout or 30,
        )
        response.raise_for_status()
        return response.json()

    except requests.exceptions.Timeout:
        frappe.log_error(
            title="MCP Query Timeout",
            message=f"Query timed out after {settings.timeout or 30}s: {message}",
        )
        frappe.throw(_("Request timed out. Please try again."))

    except requests.exceptions.RequestException as e:
        frappe.log_error(
            title="MCP Query Failed",
            message=f"MCP query failed: {e}\nMessage: {message}",
        )
        frappe.throw(_("Failed to query AI assistant. Please check the logs."))


@frappe.whitelist()
def test_connection():
    """Test connectivity to MCP server using sid cookie authentication."""
    settings = frappe.get_single("MCP Server Settings")

    if not settings.enabled:
        return {"success": False, "message": "MCP integration is not enabled"}

    if frappe.session.user == "Guest":
        return {"success": False, "message": "Please log in to test the connection"}

    try:
        sid = frappe.session.sid

        health_response = requests.get(
            f"{settings.mcp_server_url}/health",
            cookies={"sid": sid},
            timeout=10,
        )

        if health_response.status_code != 200:
            return {
                "success": False,
                "message": f"MCP server health check failed (status {health_response.status_code})",
            }

        health_data = health_response.json() if health_response.text else {}

        test_query = {
            "message": "test connection",
            "context": {
                "user_id": frappe.session.user,
                "timestamp": datetime.now().isoformat(),
            },
        }

        query_response = requests.post(
            f"{settings.mcp_server_url}/api/v1/chat",
            json=test_query,
            cookies={"sid": sid},
            headers={"Content-Type": "application/json"},
            timeout=settings.timeout or 30,
        )

        if query_response.status_code == 200:
            return {
                "success": True,
                "message": "Successfully connected to MCP server",
                "details": {
                    "health": health_data,
                    "auth_method": "sid cookie",
                    "user": frappe.session.user,
                },
            }
        else:
            return {
                "success": False,
                "message": f"Health OK but query test failed (status {query_response.status_code})",
                "details": {
                    "health": health_data,
                    "error": query_response.text[:200] if query_response.text else "",
                },
            }

    except requests.exceptions.Timeout:
        return {
            "success": False,
            "message": "Connection timeout. Check if MCP server is running.",
        }

    except requests.exceptions.ConnectionError as e:
        return {
            "success": False,
            "message": f"Cannot connect to MCP server: {e}",
        }

    except Exception as e:
        frappe.log_error(
            title="MCP Connection Test Failed",
            message=f"Error testing MCP connection: {e}",
        )
        return {"success": False, "message": f"Connection test failed: {e}"}
