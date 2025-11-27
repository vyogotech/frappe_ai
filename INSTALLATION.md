# Frappe AI - Installation Guide

This guide will walk you through installing and configuring the Frappe AI app to integrate with your MCP server.

## Prerequisites

1. Frappe/ERPNext instance (v13 or higher)
2. MCP Server running and accessible
3. Bench CLI installed

## Step 1: Get the App

Navigate to your bench directory and get the app:

```bash
cd ~/frappe-bench
bench get-app /path/to/frappe_ai
```

Or if hosted on GitHub:

```bash
bench get-app https://github.com/yourusername/frappe_ai
```

## Step 2: Install on Site

Install the app on your site:

```bash
bench --site your-site.local install-app frappe_ai
```

Restart bench:

```bash
bench restart
```

## Step 3: Setup OAuth2 Client

### 3.1 Create OAuth Client

1. Login to your Frappe/ERPNext instance
2. Navigate to: **Integrations > OAuth Client** (or go to `/app/oauth-client`)
3. Click **New**
4. Fill in the details:
   - **App Name**: MCP Backend Integration
   - **Default Redirect URI**: (leave blank for client credentials)
   - **Scopes**: Select `openid`, `profile`, `email`, and `all`
   - **Grant Type**: `Client Credentials`
   - **Client Type**: Confidential

5. **Save** the document
6. **Copy the Client ID and Client Secret** (you'll need these in the next step)

### 3.2 Alternative: Use Script to Create OAuth Client

You can also use the provided script:

```bash
cd ~/frappe-bench
bench --site your-site.local execute frappe_ai.setup.create_oauth_client
```

This will create an OAuth client and display the credentials.

## Step 4: Configure MCP Server Settings

### 4.1 Open Settings

Navigate to: **Frappe AI > MCP Server Settings** (or go to `/app/mcp-server-settings`)

### 4.2 Fill in Configuration

- **Enabled**: ✓ (check this box)
- **MCP Server URL**: `http://localhost:8080` (or your MCP server URL)
- **Frappe Base URL**: `http://localhost:8000` (or your Frappe instance URL)
- **OAuth Client ID**: Paste the Client ID from Step 3
- **OAuth Client Secret**: Paste the Client Secret from Step 3
- **Timeout**: `30` seconds (default)

### 4.3 Save and Test

1. Click **Save**
2. Click **Test Connection** button to verify the setup
3. You should see a success message if everything is configured correctly

## Step 5: Configure MCP Server

Make sure your MCP server is configured to accept OAuth2 authentication from Frappe.

Update your `config.yaml`:

```yaml
auth:
  enabled: true
  require_auth: false  # Set to true for production

  oauth2:
    # Frappe OAuth endpoints
    token_info_url: "http://localhost:8000/api/method/frappe.integrations.oauth2.openid.userinfo"
    issuer_url: "http://localhost:8000"

    # Trusted clients that can provide user context headers
    trusted_clients:
      - "your-oauth-client-id"  # Use the Client ID from Step 3

    validate_remote: true
    timeout: "30s"

  cache:
    ttl: "5m"
    cleanup_interval: "10m"
```

Restart your MCP server:

```bash
cd ~/frappe-mcp-server
./frappe-mcp-server-stdio-darwin-arm64  # or your binary
```

## Step 6: Test the Integration

### 6.1 Using Awesome Bar

1. Click on the **Awesome Bar** (search bar at the top)
2. Type your question: "Show me all open projects"
3. Select the **"Ask AI: Show me all open projects"** option
4. You should see an AI dialog with the response

### 6.2 Using Code

Open the Frappe console and test:

```python
from frappe_ai.api.ai_query import query

result = query("List all customers")
print(result)
```

### 6.3 Using REST API

```bash
# Get API keys from User Settings
curl -X POST https://your-site.com/api/method/frappe_ai.api.ai_query.query \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me sales statistics"}'
```

## Troubleshooting

### Issue: "Failed to get access token"

**Solution:**
- Verify OAuth Client ID and Secret are correct
- Check that OAuth Client has `client_credentials` grant type
- Ensure Frappe Base URL is accessible from the server

### Issue: "Failed to query AI assistant"

**Solution:**
- Check MCP Server URL is correct and accessible
- Verify MCP server is running
- Check MCP server logs for errors
- Use "Test Connection" button in MCP Server Settings

### Issue: "Connection timeout"

**Solution:**
- Increase timeout in MCP Server Settings
- Check network connectivity between Frappe and MCP server
- Verify firewall rules allow communication

### Issue: Awesome Bar doesn't show AI option

**Solution:**
- Clear browser cache
- Run `bench clear-cache`
- Restart bench: `bench restart`
- Check that app is installed: `bench --site your-site.local list-apps`

## Advanced Configuration

### Using Redis for Token Caching (Production)

For production deployments, consider modifying the `ai_query.py` to use Redis instead of in-memory caching:

```python
# In frappe_ai/api/ai_query.py
import redis

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def get_access_token():
    cache_key = "mcp_access_token"
    cached = redis_client.get(cache_key)
    if cached:
        return cached.decode()
    
    # ... rest of the token fetching logic
    
    redis_client.setex(cache_key, 3600, token_data["access_token"])
```

### Enable Debug Logging

Add to your `site_config.json`:

```json
{
  "developer_mode": 1,
  "logging": 2
}
```

### Custom Timeout Settings

Adjust timeouts based on your query complexity:

- Simple queries: 10-30 seconds
- Complex queries: 60-120 seconds
- Large data processing: 180+ seconds

## Uninstallation

If you need to remove the app:

```bash
bench --site your-site.local uninstall-app frappe_ai
bench remove-app frappe_ai
```

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/yourusername/frappe_ai/issues
- Documentation: https://github.com/yourusername/frappe_ai/wiki

## Next Steps

- Explore different types of queries
- Customize the UI to match your theme
- Integrate with custom doctypes
- Set up monitoring and analytics

