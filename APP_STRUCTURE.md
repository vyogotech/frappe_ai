# Frappe AI - App Structure

This document explains the structure and purpose of each file in the Frappe AI app.

## 📁 Root Directory

```
frappe_ai/
├── setup.py                 # Python package setup
├── requirements.txt         # Python dependencies
├── MANIFEST.in             # Files to include in package
├── license.txt             # MIT License
├── .gitignore              # Git ignore rules
├── README.md               # Main documentation
├── INSTALLATION.md         # Detailed installation guide
├── QUICKSTART.md           # 5-minute quick start guide
└── APP_STRUCTURE.md        # This file
```

## 📁 frappe_ai/ (Main Module)

### Core Files

```
frappe_ai/
├── __init__.py             # App version
├── hooks.py                # Frappe app hooks and configuration
├── modules.txt             # Module list
├── patches.txt             # Database patches
└── setup.py                # Setup utilities (OAuth client creation)
```

**hooks.py** - The main configuration file that:
- Defines app metadata (name, description, version)
- Includes JS/CSS bundles
- Registers event hooks (optional)
- Configures scheduled tasks (optional)

**setup.py** - Utilities for:
- Creating OAuth2 client automatically
- Post-installation setup
- Helper functions

### 📁 api/ - REST API Endpoints

```
frappe_ai/api/
├── __init__.py
└── ai_query.py             # Main AI query API
```

**ai_query.py** contains:
- `query(message)` - Main whitelisted API endpoint for AI queries
- `get_access_token()` - OAuth2 token management with caching
- `test_connection()` - Connection testing utility
- `clear_token_cache()` - Cache management

### 📁 mcp_integration/ - Custom DocTypes

```
frappe_ai/mcp_integration/
├── __init__.py
└── doctype/
    └── mcp_server_settings/
        ├── __init__.py
        ├── mcp_server_settings.json        # DocType definition
        ├── mcp_server_settings.py          # Python controller
        ├── mcp_server_settings.js          # JavaScript UI
        └── test_mcp_server_settings.py    # Unit tests
```

**MCP Server Settings DocType** - Single DocType for configuration:

**Fields:**
- `enabled` - Enable/disable integration
- `mcp_server_url` - MCP server endpoint
- `frappe_base_url` - OAuth server URL
- `oauth_client_id` - OAuth client ID
- `oauth_client_secret` - OAuth client secret (encrypted)
- `timeout` - Request timeout in seconds
- `cache_ttl` - Token cache duration
- `validate_remote` - Remote token validation flag

**Features:**
- URL validation
- Timeout validation
- Test connection button
- Clear cache button
- Real-time alerts
- Auto-clear token cache on save

### 📁 public/ - Frontend Assets

```
frappe_ai/public/
├── css/
│   └── frappe_ai.css              # Custom styles
└── js/
    └── frappe_ai.bundle.js        # Main JavaScript bundle
```

**frappe_ai.bundle.js** - Frontend functionality:
- Awesome Bar integration
- AI query dialog
- Loading states
- Response formatting
- Markdown rendering
- Copy to clipboard
- Error handling

**frappe_ai.css** - Custom styling:
- Dialog styling
- Response formatting
- Code blocks
- Tables
- Mobile responsive
- Dark mode support

### 📁 config/ - App Configuration

```
frappe_ai/config/
├── __init__.py
├── desktop.py              # Desktop module icon
└── docs.py                 # Documentation config
```

**desktop.py** - Defines:
- Module icon (robot/AI icon)
- Module color (#667eea - purple)
- Module description
- Module category

## 🔐 OAuth2 Authentication Flow

```
┌──────────┐
│  User    │
│ Browser  │
└────┬─────┘
     │ 1. Session Cookie
     ↓
┌─────────────────┐
│  Frappe Backend │
│                 │
│  ai_query.py    │
└────┬────────────┘
     │ 2. Get OAuth Token
     │    (Client Credentials)
     ↓
┌──────────────────┐
│ OAuth2 Server    │
│ (Frappe OAuth)   │
└────┬─────────────┘
     │ 3. Return Access Token
     ↓
┌─────────────────┐
│  Frappe Backend │ 4. Call MCP Server with:
│  ai_query.py    │    - Bearer Token
└────┬────────────┘    - User Context Headers
     │
     ↓
┌─────────────────┐
│   MCP Server    │ 5. Validate Token
│                 │    Trust User Context
│  Go Backend     │    Execute Query
└────┬────────────┘
     │ 6. Return AI Response
     ↓
┌─────────────────┐
│  Frappe Backend │
│  ai_query.py    │
└────┬────────────┘
     │ 7. Return JSON
     ↓
┌──────────┐
│  User    │
│ Browser  │
└──────────┘
```

## 📊 Key Features Implemented

### ✅ Security
- Standard OAuth2 client credentials flow
- Token caching with TTL
- Secure password fields
- User context from trusted clients
- Request timeout limits

### ✅ User Experience
- Awesome Bar integration
- Beautiful AI dialog
- Markdown response rendering
- Loading states
- Error messages
- Copy to clipboard
- Test connection button

### ✅ Developer Experience
- Well-documented code
- Unit tests included
- Setup utilities
- Debug helpers
- Clear error messages
- Comprehensive guides

### ✅ Production Ready
- Error handling
- Logging
- Caching
- Validation
- Timeout management
- Connection testing

## 🔧 Customization Points

### UI Customization
- **Colors**: Edit `public/css/frappe_ai.css`
- **Dialog**: Edit `public/js/frappe_ai.bundle.js`
- **Icon**: Edit `config/desktop.py`

### API Customization
- **Query Logic**: Edit `api/ai_query.py`
- **Token Management**: Edit `get_access_token()` function
- **Response Format**: Edit `query()` function

### Settings Customization
- **Fields**: Edit `mcp_server_settings.json`
- **Validation**: Edit `mcp_server_settings.py`
- **UI Behavior**: Edit `mcp_server_settings.js`

## 📦 Dependencies

### Python
- `frappe` - Frappe Framework
- `requests` - HTTP client for API calls

### JavaScript (Built-in)
- jQuery
- Frappe UI components
- Awesome Bar framework

## 🧪 Testing

### Unit Tests
Run tests with:
```bash
bench --site your-site.local run-tests --app frappe_ai
```

### Integration Tests
Use the Test Connection button in MCP Server Settings

### Manual Testing
1. Awesome Bar queries
2. Console queries
3. REST API calls

## 🚀 Deployment Checklist

- [ ] Install app on production site
- [ ] Create OAuth client
- [ ] Configure MCP Server Settings
- [ ] Update MCP server config.yaml
- [ ] Test connection
- [ ] Test actual queries
- [ ] Enable auth in MCP (set `require_auth: true`)
- [ ] Set up monitoring/logging
- [ ] Configure firewall rules
- [ ] Set up backup strategy

## 📝 Maintenance

### Regular Tasks
- Monitor token cache performance
- Check error logs
- Update dependencies
- Test connection periodically
- Review security settings

### Troubleshooting
1. Check MCP Server Settings
2. Verify OAuth client credentials
3. Test network connectivity
4. Review error logs
5. Clear caches if needed

## 🎯 Next Steps

1. **Install**: Follow [QUICKSTART.md](QUICKSTART.md)
2. **Configure**: Set up OAuth and MCP settings
3. **Test**: Verify everything works
4. **Customize**: Adjust UI/behavior as needed
5. **Deploy**: Move to production with proper security

---

**Questions?** Read [README.md](README.md) or [INSTALLATION.md](INSTALLATION.md)

