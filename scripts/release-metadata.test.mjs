import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { releaseMetadata } from "./release-metadata.mjs"

function fixture(name = "@joonix/opencode-example", version = "1.2.3") {
  const root = mkdtempSync(join(tmpdir(), "release-metadata-"))
  const directory = join(root, "packages", "example")
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version }))
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

test("accepts package slugs and prerelease versions", () => {
  const root = fixture("@joonix/opencode-example-plugin", "2.0.0-rc.1")
  const destination = join(root, "packages", "example-plugin")
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, "package.json"), JSON.stringify({
    name: "@joonix/opencode-example-plugin",
    version: "2.0.0-rc.1",
  }))

  assert.equal(releaseMetadata("example-plugin-v2.0.0-rc.1", root).directory, "packages/example-plugin")
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

test("rejects unknown packages and malformed tags", () => {
  assert.throws(() => releaseMetadata("missing-v1.0.0", fixture()), /Cannot read packages\/missing\/package.json/)
  assert.throws(() => releaseMetadata("example@1.2.3", fixture()), /expected <package>-v<semver>/)
  assert.throws(() => releaseMetadata("../example-v1.2.3", fixture()), /expected <package>-v<semver>/)
})
