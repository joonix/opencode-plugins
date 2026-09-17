# Releasing packages

Releases are published from Git tags by `.github/workflows/publish.yml`. GitHub Actions tests the
tagged commit, creates the npm tarball, and publishes that exact tarball through npm Trusted
Publishing. npm automatically records a provenance attestation linking the package to the source
commit and workflow run. No npm token or publishing key is stored in GitHub.

## One-time external setup

Complete this setup after `publish.yml` is present on the repository's default branch.

### npm trusted publishers

For each package, sign in to npmjs.com, open the package, then go to **Settings** and add a
**Trusted Publisher** with these values:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `joonix` |
| Repository | `opencode-plugins` |
| Workflow filename | `publish.yml` |
| Environment | Leave empty |
| Allowed actions | Enable direct `npm publish` |

Configure all current packages:

- `@joonix/opencode-reviewer`
- `@joonix/opencode-subagent-model`
- `@joonix/opencode-commands`

After one successful automated release, set each package's **Publishing access** to **Require
two-factor authentication and disallow tokens**, then revoke obsolete npm automation tokens. This
setting does not block Trusted Publishing because it uses short-lived OIDC credentials rather than
traditional tokens.

A newly created npm package has no npm settings page yet. Publish its first version manually with
`make publish-<package>`, then add its Trusted Publisher entry before releasing its next version by
tag. Trusted Publisher setup is per package, not per npm scope. This bootstrap release is the only
case that should require a traditional interactive npm login.

### Protect release tags

In the GitHub repository, open **Settings → Rules → Rulesets**, create an active tag ruleset, and
target these patterns:

- `refs/tags/reviewer-v*`
- `refs/tags/subagent-model-v*`
- `refs/tags/commands-v*`

Restrict tag updates and deletions. If creation is also restricted, add the maintainer account or
team that performs releases as an allowed bypass actor. Add a corresponding pattern whenever a new
package is introduced.

## Publish a release

1. Update the package's `version` in `packages/<package>/package.json`.
2. Refresh `bun.lock` with `bun install --force`.
3. Run `make test` and `make test-load` locally.
4. Commit the version and lockfile changes, get them reviewed, and merge them to `main`.
5. Create a GitHub release whose tag is `<package>-v<version>` and whose target is that commit on
   `main`. Examples:
   - `reviewer-v0.3.2`
   - `subagent-model-v0.3.1`
   - `commands-v0.1.1`
   With GitHub CLI, for example:

   ```sh
   gh release create reviewer-v0.3.2 \
     --repo joonix/opencode-plugins \
     --target main \
     --title "@joonix/opencode-reviewer 0.3.2" \
     --generate-notes
   ```

6. Watch the **publish** workflow. Do not create another tag or publish manually if it fails; fix
   the cause while preserving the tagged commit and determine whether the immutable npm version was
   already published.
7. Open the package version on npm and confirm it shows provenance linked to the expected GitHub
   commit and workflow.

The workflow rejects malformed tags, tag/package version mismatches, unknown packages, and tags
that do not point to a commit reachable from `main`.

Consumers can verify npm signatures and attestations for installed dependencies with:

```sh
npm audit signatures
```
