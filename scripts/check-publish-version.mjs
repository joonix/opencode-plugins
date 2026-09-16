import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const [directory, npm = "npm"] = process.argv.slice(2)
if (!directory) {
  console.error("usage: check-publish-version.mjs <package-directory> [npm-command]")
  process.exit(2)
}

const manifestPath = join(directory, "package.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const spec = `${manifest.name}@${manifest.version}`
const result = spawnSync(npm, ["view", spec, "version", "--json"], { encoding: "utf8" })

if (result.status === 0) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version)
  const suggestion = match
    ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
    : "a new unpublished version"
  console.error(`Cannot publish ${spec}: that version already exists on npm.`)
  console.error(`Bump ${manifestPath} to ${suggestion}, run "bun install --force", then retry.`)
  process.exit(1)
}

const failure = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
if (/\bE404\b|404 Not Found/.test(failure)) {
  console.log(`publish version available: ${spec}`)
  process.exit(0)
}

process.stderr.write(failure.trimStart())
process.exit(result.status ?? 1)
