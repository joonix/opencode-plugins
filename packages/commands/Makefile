BUN ?= bun
NPM ?= npm

.PHONY: test test-load publish

test:
	$(BUN) run test

test-load:
	./scripts/load-check.sh

# Prompts for an npm one-time password unless a bypass-2FA token is configured.
publish:
	$(NPM) publish --access public
