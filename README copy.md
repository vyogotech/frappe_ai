# Frappe AI

An intelligent AI assistant for Frappe/ERPNext that integrates with the MCP (Model Context Protocol) server using OAuth2 authentication.

## Features

- 🔐 Secure OAuth2 client credentials flow
- 🤖 AI-powered queries about your ERPNext data
- ⚡ Awesome Bar integration for quick AI access
- ⚙️ Easy configuration through MCP Server Settings

## Installation

1. Get the app:
```bash
bench get-app https://github.com/yourusername/frappe_ai
```

2. Install the app on your site:
```bash
bench --site your-site install-app frappe_ai
```

3. Setup OAuth2 Client in Frappe:
   - Navigate to `/app/oauth-client`
   - Create new OAuth Client with:
     - **App Name**: MCP Backend Integration
     - **Grant Type**: Client Credentials
     - **Scopes**: openid, profile, email, all

4. Configure MCP Server Settings:
   - Navigate to `/app/mcp-server-settings`
   - Fill in:
     - MCP Server URL (e.g., `http://localhost:8080`)
     - Frappe Base URL (e.g., `http://localhost:8000`)
     - OAuth Client ID and Secret (from step 3)

## Usage

### From Awesome Bar
Simply type your query in the Awesome Bar and select **"Ask AI: [your query]"**

Example queries:
- "Show me all open projects"
- "What are the top customers by revenue?"
- "List pending sales orders"

### From Code
```python
import frappe
from frappe_ai.api.ai_query import query

result = query("Show me all open projects")
print(result['response'])
```

### From REST API
```bash
curl -X POST https://your-site.com/api/method/frappe_ai.api.ai_query.query \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me all open projects"}'
```

## Configuration

All configuration is done through the **MCP Server Settings** DocType:
- Navigate to `/app/mcp-server-settings`
- Enable/disable the integration
- Configure MCP server URL
- Set OAuth2 credentials
- Adjust timeout settings

## Security

- Uses standard OAuth2 client credentials grant
- All tokens are cached in-memory with automatic expiration
- User context is securely transmitted via headers
- No custom authentication schemes

## License

MIT

