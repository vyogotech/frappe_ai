# Frappe AI - Quick Start Guide

Get your AI assistant up and running in 5 minutes! 🚀

## 1. Install the App (2 minutes)

```bash
cd ~/frappe-bench
bench get-app /path/to/frappe_ai
bench --site your-site.local install-app frappe_ai
bench restart
```

## 2. Create OAuth Client (1 minute)

```bash
bench --site your-site.local execute frappe_ai.setup.create_oauth_client
```

**Copy the Client ID and Client Secret** that are displayed!

## 3. Configure Settings (1 minute)

1. Go to: `/app/ai-assistant-settings`
2. Fill in:
   ```
   ✓ Enabled
   Agent URL: http://localhost:8484
   Timeout: 30
   ```
3. Click **Save**

## 4. Update MCP Server Config (1 minute)

Edit your MCP server `config.yaml`:

```yaml
auth:
  enabled: true
  oauth2:
    token_info_url: "http://localhost:8000/api/method/frappe.integrations.oauth2.openid.userinfo"
    issuer_url: "http://localhost:8000"
    trusted_clients:
      - "your-client-id-from-step-2"
```

Restart MCP server:

```bash
cd ~/frappe-mcp-server
./frappe-mcp-server-stdio-darwin-arm64
```

## 5. Test It! (30 seconds)

### Using Awesome Bar:
1. Click the search bar at the top
2. Type: "Show me all open projects"
3. Select "Ask AI: Show me all open projects"
4. See the magic! ✨

### Using Console:
```python
from frappe_ai.api.ai_query import query
query("List all customers")
```

## Common Queries to Try

- "Show me all open projects"
- "List customers with revenue > 100000"
- "What are pending sales orders?"
- "Show project timeline for Q4"
- "List top 5 items by sales"

## Troubleshooting

**Q: Awesome Bar doesn't show AI option?**
```bash
bench clear-cache
bench restart
```

**Q: Token errors?**
- Verify Client ID/Secret in Settings
- Check OAuth Client has "Client Credentials" grant

**Q: Connection timeout?**
- Increase timeout in Settings
- Check MCP server is running
- Verify URLs are correct

## What's Next?

- 📖 Read [INSTALLATION.md](INSTALLATION.md) for detailed setup
- 🔧 Check [README.md](README.md) for features
- 💡 Customize the UI in `public/js/frappe_ai.bundle.js`
- 🚀 Deploy to production with proper security settings

## Architecture Overview

```
┌──────────┐      Session      ┌───────────────┐
│  Browser │ ───────────────> │ Frappe/ERPNext│
└──────────┘                   └───────┬───────┘
                                       │
                                       │ OAuth2 Client Credentials
                                       │ + User Context Headers
                                       │
                                       v
                              ┌────────────────┐
                              │   MCP Server   │
                              │  (validates    │
                              │   OAuth token) │
                              └────────────────┘
```

## Key Features

✅ **Secure**: OAuth2 standard authentication  
✅ **Fast**: Token caching for performance  
✅ **Easy**: Awesome Bar integration  
✅ **Smart**: Context-aware AI responses  
✅ **Reliable**: Error handling and logging  

---

**Need help?** Check [INSTALLATION.md](INSTALLATION.md) or open an issue on GitHub!

