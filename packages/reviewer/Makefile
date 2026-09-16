BUN ?= bun
NPM ?= npm

.PHONY: install test test-load test-security publish

install:
	$(BUN) install

test:
	$(BUN) x tsc --noEmit
	$(BUN) test

test-load:
	./scripts/load-check.sh

test-security:
	REVIEWER_LIVE=1 $(BUN) test test/reviewer.test.ts --test-name-pattern 'live classifier'

# Prompts for an npm one-time password unless a bypass-2FA token is configured.
publish:
	$(NPM) publish --access public
