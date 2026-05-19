# Frappe AI Makefile — convenience targets for local quality + security audit.
# The Frappe app itself is built and tested via `bench` from the bench root;
# this file is for app-local checks that don't need a bench (lint, audit,
# scanner suite).

.PHONY: help lint format typecheck test-js audit audit-clean

AUDIT_DIR ?= audit-out

help:
	@echo "Available targets:"
	@echo "  lint       - ruff check + ruff format --check + TypeScript type-check"
	@echo "  format     - ruff format (in-place)"
	@echo "  typecheck  - pyrefly (Python) + tsc --noEmit (TS)"
	@echo "  test-js    - vitest run"
	@echo "  audit      - Full scanner suite: ruff, bandit, pip-audit, npm audit, trivy, gitleaks"
	@echo "  audit-clean - Remove $(AUDIT_DIR)/"

lint:
	uvx ruff check
	uvx ruff format --check
	npm run type-check

format:
	uvx ruff format

typecheck:
	uvx pyrefly check
	npm run type-check

test-js:
	npm test -- --run

# Reproducible audit scanner suite — dumps raw JSON to $(AUDIT_DIR) so findings
# can be inspected without an LLM in the loop. Missing tools warn-skip so this
# runs on any host with whatever subset is installed. Run after every change
# touching deps, network/auth, or request handling.
audit:
	@mkdir -p $(AUDIT_DIR)
	@echo "==> ruff (lint)"
	@uvx ruff check --output-format json frappe_ai > $(AUDIT_DIR)/ruff.json 2>&1 || true
	@echo "==> bandit (Python AST security)"
	@if command -v bandit >/dev/null 2>&1; then \
		bandit -r frappe_ai -f json -o $(AUDIT_DIR)/bandit.json -q || true; \
	elif command -v pipx >/dev/null 2>&1; then \
		pipx run bandit -r frappe_ai -f json -o $(AUDIT_DIR)/bandit.json -q || true; \
	else \
		echo "  SKIP: bandit not installed (pipx install bandit)"; \
	fi
	@echo "==> pip-audit (dep CVEs from pyproject.toml)"
	@if command -v pip-audit >/dev/null 2>&1; then \
		pip-audit -f json -o $(AUDIT_DIR)/pip-audit.json . 2>/dev/null || true; \
	else \
		echo "  SKIP: pip-audit not installed (pipx install pip-audit)"; \
	fi
	@echo "==> npm audit (JS deps)"
	@if [ -f package.json ]; then \
		npm audit --json > $(AUDIT_DIR)/npm-audit.json 2>/dev/null || true; \
	fi
	@echo "==> trivy fs (vuln + misconfig)"
	@if command -v trivy >/dev/null 2>&1; then \
		trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json --output $(AUDIT_DIR)/trivy.json . 2>/dev/null || true; \
	else \
		echo "  SKIP: trivy not installed (brew install trivy)"; \
	fi
	@echo "==> gitleaks (committed secrets)"
	@if command -v gitleaks >/dev/null 2>&1; then \
		gitleaks detect --source . --no-banner --report-format json --report-path $(AUDIT_DIR)/gitleaks.json 2>/dev/null || true; \
	else \
		echo "  SKIP: gitleaks not installed (brew install gitleaks)"; \
	fi
	@echo ""
	@echo "Audit output: $(AUDIT_DIR)/"
	@ls -la $(AUDIT_DIR)/ 2>/dev/null || true

audit-clean:
	rm -rf $(AUDIT_DIR)
