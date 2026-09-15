BUN ?= bun

.PHONY: install test test-load

install:
	$(BUN) install

test:
	$(BUN) run --filter '*' test

test-load:
	$(MAKE) -C packages/reviewer test-load
	$(MAKE) -C packages/subagent-model test-load
