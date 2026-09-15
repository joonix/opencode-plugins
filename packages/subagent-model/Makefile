BUN ?= bun

.PHONY: test test-load

test:
	../../node_modules/.bin/tsc --noEmit
	$(BUN) test

test-load:
	./scripts/load-check.sh
