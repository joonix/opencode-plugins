BUN ?= bun

.PHONY: test test-load

test:
	../../node_modules/.bin/tsc --noEmit
	$(BUN) test
	./scripts/check-load-log-test.sh

test-load:
	./scripts/load-check.sh
