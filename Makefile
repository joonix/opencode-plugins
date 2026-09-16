BUN ?= bun

.PHONY: install test test-load publish

install:
	$(BUN) install

test:
	$(BUN) run --filter '*' test

test-load:
	$(MAKE) -C packages/reviewer test-load
	$(MAKE) -C packages/subagent-model test-load

# Publishes both packages after the suite passes, prompting for an npm one-time
# password per package. A version already on the registry fails the publish.
publish: test
	$(MAKE) -C packages/reviewer publish
	$(MAKE) -C packages/subagent-model publish
