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
check-publish: $(PACKAGES:%=check-publish-%)

publish: check-publish test test-load
	@for package in $(PACKAGES); do \
		$(MAKE) -C packages/$$package publish || exit $$?; \
	done

check-publish-%:
	$(NODE) scripts/check-publish-version.mjs packages/$* "$(NPM)"

publish-%: check-publish-% test test-load-%
	$(MAKE) -C packages/$* publish
