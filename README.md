# Frappe AI

An intelligent AI assistant for Frappe/ERPNext that talks to a configured AI agent over HTTP and renders streamed responses (markdown prose plus structured KPI/chart/table blocks) in a chat sidebar embedded in the desk.

## Features

- 🤖 AI-powered queries about your ERPNext data
- 🪟 In-desk chat sidebar with streamed markdown + structured blocks
- ⚙️ Easy configuration through AI Assistant Settings

## Installation

1. Get the app:
```bash
bench get-app https://github.com/yourusername/frappe_ai
```

2. Install the app on your site:
```bash
bench --site your-site install-app frappe_ai
```

3. Configure AI Assistant Settings:
   - Navigate to `/app/ai-assistant-settings`
   - Fill in:
     - **Enabled**: ✓
     - **Agent URL** (e.g., `http://localhost:8484`) — must be reachable from the user's browser
     - **Timeout** (default `30` seconds)

## Usage

Open the chat sidebar from the navbar button and type your query. Example queries:
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

All configuration is done through the **AI Assistant Settings** DocType:
- Navigate to `/app/ai-assistant-settings`
- Enable/disable the integration
- Configure the Agent URL
- Adjust timeout, sidebar width, and keyboard shortcut

## License

MIT

