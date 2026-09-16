import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const [directory, npm = "npm", mode] = process.argv.slice(2)
if (!directory) {
  console.error("usage: check-publish-version.mjs <package-directory> [npm-command]")
  process.exit(2)
}

const packageDirectory = resolve(directory)
const manifestPath = join(packageDirectory, "package.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const spec = `${manifest.name}@${manifest.version}`
const result = spawnSync(npm, ["view", spec, "version", "--json"], { encoding: "utf8" })

if (result.status === 0) {
  const diff = spawnSync(npm, [
    "diff",
    `--diff=${spec}`,
    `--diff=${packageDirectory}`,
    "--diff-name-only",
  ], { encoding: "utf8" })
  if (diff.status !== 0) {
    process.stderr.write(`${diff.stdout ?? ""}\n${diff.stderr ?? ""}`.trimStart())
    process.exit(diff.status ?? 1)
  }
  if (diff.stdout.trim() === "") {
    const message = `skip ${spec}: local package matches the published release`
    if (mode === "--aggregate") {
      console.log(message)
      process.exit(3)
    }
    console.error(`${message}; there is nothing new to publish.`)
    process.exit(1)
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version)
  const suggestion = match
    ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
    : "a new unpublished version"
  console.error(`Cannot publish ${spec}: local package content differs from that published version.`)
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
