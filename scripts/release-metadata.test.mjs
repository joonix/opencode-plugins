import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { releaseMetadata } from "./release-metadata.mjs"

function fixture(
  name = "@joonix/opencode-example",
  version = "1.2.3",
  slug = "example",
  repositoryDirectory = `packages/${slug}`,
) {
  const root = mkdtempSync(join(tmpdir(), "release-metadata-"))
  const directory = join(root, "packages", slug)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    name,
    version,
    repository: {
      type: "git",
      url: "git+https://github.com/joonix/opencode-plugins.git",
      directory: repositoryDirectory,
    },
  }))
  return root
}

test("returns package metadata when the tag and manifest agree", () => {
  assert.deepEqual(releaseMetadata("example-v1.2.3", fixture()), {
    slug: "example",
    directory: "packages/example",
    name: "@joonix/opencode-example",
    version: "1.2.3",
    spec: "@joonix/opencode-example@1.2.3",
  })
})

test("accepts package slugs containing hyphens", () => {
  const root = fixture("@joonix/opencode-example-plugin", "2.0.0", "example-plugin")
  assert.equal(releaseMetadata("example-plugin-v2.0.0", root).directory, "packages/example-plugin")
})

test("rejects a tag whose version does not match the manifest", () => {
  assert.throws(
    () => releaseMetadata("example-v1.2.4", fixture()),
    /does not match @joonix\/opencode-example version 1\.2\.3/,
  )
})

test("rejects an unexpected package name", () => {
  assert.throws(
    () => releaseMetadata("example-v1.2.3", fixture("unrelated-package")),
    /selects @joonix\/opencode-example, but the manifest name is unrelated-package/,
  )
})

test("rejects repository metadata that cannot establish package provenance", () => {
  assert.throws(
    () => releaseMetadata("example-v1.2.3", fixture(undefined, undefined, undefined, "packages/other")),
    /repository must be .* with directory packages\/example/,
  )
})

test("rejects unknown packages and malformed tags", () => {
  assert.throws(() => releaseMetadata("missing-v1.0.0", fixture()), /Cannot read packages\/missing\/package.json/)
  assert.throws(() => releaseMetadata("example@1.2.3", fixture()), /expected <package>-v<major\.minor\.patch>/)
  assert.throws(() => releaseMetadata("example-v1.2.3-rc.1", fixture()), /expected <package>-v<major\.minor\.patch>/)
  assert.throws(() => releaseMetadata("../example-v1.2.3", fixture()), /expected <package>-v<major\.minor\.patch>/)
})
