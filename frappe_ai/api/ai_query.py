"""
AI Query API
Implements OAuth2 client credentials flow for MCP server authentication
"""
import frappe
import requests
from datetime import datetime, timedelta
from frappe import _

# Token cache (in-memory for simplicity, use Redis in production)
_token_cache = {}


def get_access_token():
    """
    Get OAuth2 access token using client credentials grant
    Standard OAuth2 - no custom auth
    """
    settings = frappe.get_single("MCP Server Settings")
    
    if not settings.enabled:
        frappe.throw(_("MCP integration is not enabled"))
    
    # Check cache
    cache_key = "mcp_access_token"
    if cache_key in _token_cache:
        token_data = _token_cache[cache_key]
        if datetime.now() < token_data["expires_at"]:
            return token_data["access_token"]
    
    # Get new token using client credentials grant
    token_url = f"{settings.frappe_base_url}/api/method/frappe.integrations.oauth2.get_token"
    
    try:
        response = requests.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.oauth_client_id,
                "client_secret": settings.get_password("oauth_client_secret"),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=settings.timeout or 30
        )
        
        if response.status_code != 200:
            frappe.log_error(
                title="OAuth Token Error",
                message=f"Failed to get access token. Status: {response.status_code}, Response: {response.text}"
            )
            frappe.throw(_("Failed to get access token from OAuth server"))
        
        token_data = response.json()
        
        # Cache token
        _token_cache[cache_key] = {
            "access_token": token_data["access_token"],
            "expires_at": datetime.now() + timedelta(seconds=token_data.get("expires_in", 3600))
        }
        
        return token_data["access_token"]
    
    except requests.exceptions.RequestException as e:
        frappe.log_error(
            title="OAuth Request Error",
            message=f"Failed to request access token: {str(e)}"
        )
        frappe.throw(_("Failed to connect to OAuth server"))


@frappe.whitelist()
def query(message):
    """
    AI query endpoint using sid cookie authentication
    
    Uses the user's Frappe session (sid cookie) for authentication.
    This ensures user-level permissions are maintained.
    
    Args:
        message (str): The query/message to send to the AI assistant
    
    Returns:
        dict: Response from MCP server containing AI-generated answer
    """
    if not message:
        frappe.throw(_("Message is required"))
    
    # Get authenticated user from Frappe session
    user = frappe.session.user
    
    if user == "Guest":
        frappe.throw(_("Authentication required"))
    
    user_email = frappe.db.get_value("User", user, "email")
    
    settings = frappe.get_single("MCP Server Settings")
    
    if not settings.enabled:
        frappe.throw(_("MCP integration is not enabled"))
    
    # Use sid cookie for authentication (user's session)
    sid = frappe.session.sid
    
    payload = {
        "message": message,
        "context": {
            "user_id": user,
            "user_email": user_email,
            "timestamp": datetime.now().isoformat()
        }
    }
    
    try:
        response = requests.post(
            f"{settings.mcp_server_url}/api/v1/chat",
            json=payload,
            cookies={"sid": sid},  # Pass user's session
            headers={"Content-Type": "application/json"},
            timeout=settings.timeout or 30
        )
        
        response.raise_for_status()
        return response.json()
    
    except requests.exceptions.Timeout:
        frappe.log_error(
            title="MCP Query Timeout",
            message=f"Query timed out after {settings.timeout or 30} seconds: {message}"
        )
        frappe.throw(_("Request timed out. Please try again."))
    
    except requests.exceptions.RequestException as e:
        frappe.log_error(
            title="MCP Query Failed",
            message=f"MCP query failed: {str(e)}\nMessage: {message}"
        )
        frappe.throw(_("Failed to query AI assistant. Please check the logs."))


@frappe.whitelist()
def clear_token_cache():
    """
    Clear the OAuth token cache
    Useful for debugging or forcing token refresh
    """
    global _token_cache
    _token_cache = {}
    return {"message": "Token cache cleared"}


@frappe.whitelist()
def test_connection():
    """
    Test the connection to MCP server using sid cookie authentication
    Returns connection status and server info
    """
    settings = frappe.get_single("MCP Server Settings")
    
    if not settings.enabled:
        return {
            "success": False,
            "message": "MCP integration is not enabled"
        }
    
    # Check if user is logged in
    if frappe.session.user == "Guest":
        return {
            "success": False,
            "message": "Please log in to test the connection"
        }
    
    try:
        # Use sid cookie for authentication (same as query function)
        sid = frappe.session.sid
        
        # Test 1: Check MCP server health endpoint
        health_response = requests.get(
            f"{settings.mcp_server_url}/health",
            cookies={"sid": sid},
            timeout=10
        )
        
        if health_response.status_code != 200:
            return {
                "success": False,
                "message": f"MCP server health check failed (status {health_response.status_code})"
            }
        
        health_data = health_response.json() if health_response.text else {}
        
        # Test 2: Try a simple query to verify end-to-end
        test_query = {
            "message": "test connection",
            "context": {
                "user_id": frappe.session.user,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        query_response = requests.post(
            f"{settings.mcp_server_url}/api/v1/chat",
            json=test_query,
            cookies={"sid": sid},
            headers={"Content-Type": "application/json"},
            timeout=settings.timeout or 30
        )
        
        if query_response.status_code == 200:
            return {
                "success": True,
                "message": "Successfully connected to MCP server and validated authentication",
                "details": {
                    "health": health_data,
                    "auth_method": "sid cookie",
                    "user": frappe.session.user,
                    "query_test": "passed"
                }
            }
        else:
            return {
                "success": False,
                "message": f"MCP server health OK, but query test failed (status {query_response.status_code})",
                "details": {
                    "health": health_data,
                    "error": query_response.text[:200] if query_response.text else "No error details"
                }
            }
    
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "message": "Connection timeout. Please check if MCP server is running."
        }
    
    except requests.exceptions.ConnectionError as e:
        return {
            "success": False,
            "message": f"Cannot connect to MCP server. Please check the URL: {str(e)}"
        }
    
    except Exception as e:
        frappe.log_error(
            title="MCP Connection Test Failed",
            message=f"Error testing MCP connection: {str(e)}"
        )
        return {
            "success": False,
            "message": f"Connection test failed: {str(e)}"
        }

