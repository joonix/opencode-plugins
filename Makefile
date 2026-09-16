BUN ?= bun
NODE ?= node
NPM ?= npm
OPENCODE ?= $(HOME)/.bun/bin/opencode2

PACKAGES := $(patsubst packages/%/Makefile,%,$(wildcard packages/*/Makefile))

# The per-package targets are deliberately not .PHONY: make skips the implicit
# rule search for phony targets, which would leave the pattern rules unmatched.
# No file is ever named after them, so they always run.
.PHONY: install test test-load check-publish publish

install:
	$(BUN) install

test:
	$(BUN) run --filter '*' test

test-load: $(PACKAGES:%=test-load-%)

test-load-%:
	$(MAKE) -C packages/$* test-load OPENCODE="$(OPENCODE)"

# The registry rejects a version it already has, so a release that only bumps
# one package publishes that one alone: make publish-reviewer. Publishing every
# package remains available for a release that bumps all of them. Check every
# version before publishing any package to avoid a partial release.
check-publish:
	@for package in $(PACKAGES); do \
		$(NODE) scripts/check-publish-version.mjs packages/$$package "$(NPM)" --aggregate; status=$$?; \
		if [ $$status -ne 0 ] && [ $$status -ne 3 ]; then exit $$status; fi; \
	done

publish: test test-load
	@candidates=""; \
	for package in $(PACKAGES); do \
		$(NODE) scripts/check-publish-version.mjs packages/$$package "$(NPM)" --aggregate; status=$$?; \
		if [ $$status -eq 0 ]; then candidates="$$candidates $$package"; \
		elif [ $$status -ne 3 ]; then exit $$status; fi; \
	done; \
	if [ -z "$$candidates" ]; then echo "No unpublished package versions to publish."; exit 0; fi; \
	for package in $$candidates; do \
		$(MAKE) -C packages/$$package publish || exit $$?; \
	done

check-publish-%:
	$(NODE) scripts/check-publish-version.mjs packages/$* "$(NPM)"

publish-%: check-publish-% test test-load-%
	$(MAKE) -C packages/$* publish
