# Third-party notices

ServerDrivenChat-owned code is provided under the root [MIT license](LICENSE).
That license does not replace the licenses of upstream code or dependencies.

## Cline-derived material

The retained Cline source fixture in `tests/fixtures/cline-4.1.22/` is governed by
its [Apache License 2.0](tests/fixtures/cline-4.1.22/LICENSE.txt).
Its [provenance record](tests/fixtures/cline-4.1.22/provenance.json) identifies the
upstream commit, source URL and SHA-256. Maintained patches in
`extensions/vscode/patches/` modify upstream Cline code; preserve upstream notices
when applying or distributing them.

Generated Cline packages retain the upstream license and bundled dependency notices.
The M24 packaging script also emits separate dependency notices for the native
add-on and companion. Generated packages are excluded from this source repository;
review their complete notices before distributing release assets.

## Dependencies

npm and Python lockfiles identify the pinned dependency graphs. Dependencies retain
their own licenses. Installed dependencies and their license files are obtained by
the package managers and are not vendored into this repository. This document is
an attribution index, not a replacement for those license texts.
