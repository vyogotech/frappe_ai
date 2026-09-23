# Security Policy

## Supported versions

This app has no tagged releases yet; `frappe_ai/__init__.py` declares version 0.0.1.

| Version | Frappe | Supported |
| --- | --- | --- |
| `main` | v16 | Yes |
| anything older than the current `main` | — | No |

## Reporting a vulnerability

Report privately through GitHub, not in a public issue: open the repository's **Security and quality** tab and choose **Report a vulnerability** (<https://github.com/vyogotech/frappe_ai/security/advisories/new>). That opens a private security advisory visible only to you and the maintainers.

Private vulnerability reporting has to be switched on by a maintainer, and it may not be on yet. If that button is not there, GitHub's own advice applies: open an issue asking the maintainers for a security contact, and put nothing about the vulnerability in it.

This project publishes no security email address. `developers@vyogo.com` in `hooks.py` and `pyproject.toml` is the app's general author address, not a security contact, and mail to it is not treated as a private report.

Please include the app commit, the Frappe version, the site configuration keys involved (`frappe_ai_agent_url` and `frappe_ai_agent_url_unsafe_ok` decide how the relay treats an agent address), and the smallest request that shows the problem. Do not include a session id, a real `sid` cookie or document content.

We will acknowledge a report and say whether we accept it. Fixes land on `main`; an advisory is published from the same Security tab once a fix is available.

## Scope

In scope: this app's whitelisted endpoints under `frappe_ai/api/`, its DocType permissions and validators, the realtime channels it publishes on, and the agent URL validation in `frappe_ai/api/chat.py`.

Out of scope here: Frappe, ERPNext and the AI agent itself. Report those to their own projects.
