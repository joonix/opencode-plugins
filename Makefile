BUN ?= bun

.PHONY: install test test-load

install:
	$(BUN) install

test:
	./node_modules/.bin/tsc --noEmit
	$(BUN) test

test-load:
	./scripts/load-check.sh
