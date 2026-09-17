import { readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const TAG_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)-v(\d+\.\d+\.\d+)$/

export function releaseMetadata(tag, root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const match = TAG_PATTERN.exec(tag)
  if (!match) {
    throw new Error(`Invalid release tag ${JSON.stringify(tag)}; expected <package>-v<major.minor.patch>`)
  }

  const [, slug, version] = match
  const directory = join("packages", slug)
  const packageDirectory = resolve(root, directory)
  const relativeDirectory = relative(resolve(root, "packages"), packageDirectory)
  if (relativeDirectory.startsWith("..") || relativeDirectory === "") {
    throw new Error(`Release package directory escapes packages/: ${directory}`)
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"))
  } catch (error) {
    throw new Error(`Cannot read ${directory}/package.json: ${error.message}`)
  }

  const expectedName = `@joonix/opencode-${slug}`
  if (manifest.name !== expectedName) {
    throw new Error(`Tag ${tag} selects ${expectedName}, but the manifest name is ${manifest.name}`)
  }
  if (manifest.version !== version) {
    throw new Error(`Tag ${tag} does not match ${manifest.name} version ${manifest.version}`)
  }

  const expectedRepository = "git+https://github.com/joonix/opencode-plugins.git"
  if (manifest.repository?.url !== expectedRepository || manifest.repository?.directory !== directory) {
    throw new Error(
      `${manifest.name} repository must be ${expectedRepository} with directory ${directory}`,
    )
  }

  return {
    slug,
    directory,
    name: manifest.name,
    version,
    spec: `${manifest.name}@${version}`,
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    console.log(JSON.stringify(releaseMetadata(process.argv[2] ?? "")))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
