# Classic-hook schema evidence reconciliation

The historical `evidence/MB05/classic-hook-schema-check.json` records a README
SHA-256 of
`22daa82b52aac2ad3c038b344015aeb1ef1bd7892e8f8ecf964bd33673566e40`. The current
`extensions/claude-hook-evaluation/README.md` measures
`71f4cba4644fd4d756ff8bfbc96b32e49dd80ab01e8fcc09dec59896f932ef07`.

The schema check's recorded `settings.fragment.json` hash
`9b869e328757189bf0123f442d6b195496456fc93ec1f0c02b7552aacb42ceb0` still matches
the current file. The schema result applies to that settings fragment; it does not
depend on the README bytes. The earlier README hash is retained as historical
provenance and is not represented as a current-source match.
