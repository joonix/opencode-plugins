BUN ?= bun
NODE ?= node
NPM ?= npm
OPENCODE ?= $(HOME)/.bun/bin/opencode2

PACKAGES := $(patsubst packages/%/Makefile,%,$(wildcard packages/*/Makefile))

# The per-package targets are deliberately not .PHONY: make skips the implicit
# rule search for phony targets, which would leave the pattern rules unmatched.
# No file is ever named after them, so they always run.
.PHONY: install test test-release test-load check-publish

install:
	$(BUN) install

test: test-release
	$(BUN) run --filter '*' test

test-release:
	$(NODE) --test scripts/release-metadata.test.mjs

test-load: $(PACKAGES:%=test-load-%)

test-load-%:
	$(MAKE) -C packages/$* test-load OPENCODE="$(OPENCODE)"

# Check which workspace versions are not yet present in the npm registry.
check-publish:
	@for package in $(PACKAGES); do \
		$(NODE) scripts/check-publish-version.mjs packages/$$package "$(NPM)" --aggregate; status=$$?; \
		if [ $$status -ne 0 ] && [ $$status -ne 3 ]; then exit $$status; fi; \
	done

check-publish-%:
	$(NODE) scripts/check-publish-version.mjs packages/$* "$(NPM)"
