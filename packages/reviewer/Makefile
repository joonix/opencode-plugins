BUN ?= bun
.PHONY: install test test-load test-security

install:
	$(BUN) install

test:
	$(BUN) x tsc --noEmit
	$(BUN) test

test-load:
	./scripts/load-check.sh

test-security:
	REVIEWER_LIVE=1 $(BUN) test test/reviewer.test.ts --test-name-pattern 'live classifier'
