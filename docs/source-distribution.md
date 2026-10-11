# Source distribution and local development artifacts

The Git repository contains maintained source, tests, protocol schemas, API
contracts, locked dependencies, deployment templates, guides and license notices.
MIT applies to project-owned material; upstream notices remain separate.

## Excluded files stay on the developer's machine

`.gitignore` excludes dependency installations, compiled `dist/` output, Swift and
Python caches, generated VSIX/archive files, editor state, chat histories, logs,
local environment files, databases, backups and private key material. The sibling
`ServerDrivenChat-local` deployment directory is outside the repository and must
never be copied into it. No files need to be deleted to prepare a source submission.

The `evidence/` tree is local qualification material. Only explanatory Markdown
and exact `artifact-manifest.json` package records are versioned. Raw captures,
JSON execution reports, screenshots, signatures, transcripts and generated native
sandbox files are excluded. Historical links to those records in guides and the
tracker describe the original local acceptance archive; those links will not
resolve in a source-only clone. They are not evidence that a new checkout has
passed native qualification. Review and sanitize any future public evidence bundle
separately before publishing it.

## Fresh checkout

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for installation and tests.
`npm ci` and `npm run build` regenerate workspace dependencies and bundles.
Python environments and Swift build output are also regenerated locally.

The preserved native release bundles are not produced by the normal workspace
build. Historical packaging scripts consume exact previously reviewed Cline
artifacts; some intentionally reject the current companion version. A clean clone
alone is therefore insufficient to reproduce the accepted native release archive.
Do not substitute stock/newer Cline and claim the old acceptance still applies.
Use the recorded manifests and [Cline migration guide](guide/cline-version-migration.md)
to review any new native artifact, or obtain the exact independently verified
release inputs from the release maintainer. Release assets have not been uploaded
as part of preparing this Git repository.

Without preserved native artifacts, the native-bundle conformance test reports an
explicit skip. Release qualification must supply the exact bundles and run with
`SDC_REQUIRE_NATIVE_ARTIFACTS=1`; missing artifacts then fail. The local milestone
evidence verifiers also require the omitted evidence archive, and some require
the qualified installed host and running deployment.

## Before publishing

Inspect staged files with `git diff --cached --stat` and `git diff --cached`.
Verify the destination repository and visibility before pushing. Configure private
security reporting if available, and use the contributor and PR guidelines.
Do not force-add ignored local files to make release verifiers pass on GitHub.

## Publish the prepared checkout to your GitHub repository

The local repository uses branch `main`. Its initial source files are staged;
no initial commit or remote upload was performed during preparation. Review them
before committing:

```sh
git status --short
git diff --cached --stat
git diff --cached --check
git commit -m "Initial open-source source import"
```

If Git asks for author identity, configure your own name and email; do not use an
invented maintainer identity. Create an empty repository in your GitHub account
without generating another README or license. Copy its remote URL, then run:

```sh
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Replace the angle-bracket placeholder with your repository's actual URL. Review
repository visibility before pushing; this step publishes the committed files.
