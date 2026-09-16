BUN ?= bun

PACKAGES := $(patsubst packages/%/Makefile,%,$(wildcard packages/*/Makefile))

# The per-package targets are deliberately not .PHONY: make skips the implicit
# rule search for phony targets, which would leave the pattern rules unmatched.
# No file is ever named after them, so they always run.
.PHONY: install test test-load publish

install:
	$(BUN) install

test:
	$(BUN) run --filter '*' test

test-load: $(PACKAGES:%=test-load-%)

test-load-%:
	$(MAKE) -C packages/$* test-load

# The registry rejects a version it already has, so a release that only bumps
# one package publishes that one alone: make publish-reviewer. Publishing every
# package remains available for a release that bumps all of them. Each publish
# prompts for an npm one-time password.
publish: $(PACKAGES:%=publish-%)

publish-%: test
	$(MAKE) -C packages/$* publish
