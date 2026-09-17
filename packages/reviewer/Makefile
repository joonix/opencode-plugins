BUN ?= bun
NPM ?= npm

.PHONY: install test test-load test-security check-publish-auth publish

install:
	$(BUN) install

test:
	$(BUN) x tsc --noEmit
	$(BUN) test

test-load:
	./scripts/load-check.sh

test-security:
	REVIEWER_LIVE=1 $(BUN) test test/reviewer.test.ts --test-name-pattern 'live classifier'

check-publish-auth:
	@if ! $(NPM) whoami >/dev/null 2>&1; then \
		echo "npm authentication is missing or expired; starting login..."; \
		$(NPM) login || exit $$?; \
	fi
	@$(NPM) whoami >/dev/null 2>&1 || { \
		echo "Cannot publish: npm authentication still failed after login." >&2; \
		exit 1; \
	}

# Prompts for an npm one-time password unless a bypass-2FA token is configured.
publish: check-publish-auth
	$(NPM) publish --access public
