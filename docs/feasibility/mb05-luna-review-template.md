# MB-05: reusable Luna review packet

Use with the [completion plan](mb05-completion-plan.md). Copy this template per
numbered step or suffixed test case. All fields below are placeholders, not results.

## Implementer handoff

- Step ID / attempt ID:
- Single objective and explicit scope:
- Prerequisite step IDs and accepted review references:
- Relevant existing user authorization; any genuinely new scope:
- Baseline source snapshot and pre-existing changes:
- Changed files, bounded patch, final hashes:
- Exact commands, runtime versions, exit codes, counts/skips:
- Evidence type for each result: static / unit / fixture / real transport / native:
- Expected result and observed result:
- Native identity and artifact digests, if applicable:
- Failure injection and correlation method, if applicable:
- Secret-free evidence paths and observations:
- Cleanup/reconciliation state; any pending/unknown work:
- Limitations, unresolved questions, and proposed next step:
- Implementer result: PASS / FAIL / INCONCLUSIVE / BLOCKED:

## Prompt to send to Luna

> Review only MB-05 step **[ID]**, attempt **[ID]**, against its acceptance criteria
> in `docs/feasibility/mb05-completion-plan.md`, repository instructions, and
> DECISION-011. Read the prerequisite reviews, bounded patch, and evidence packet.
> Inspect the relevant code and exact artifacts independently. Rerun safe focused
> checks where available. Do not run native prompts, enable software, alter user
> settings, create bindings, or expand permissions as part of this review.
>
> Check for mistaken session identity, stale authority between check and effect,
> unsupported/native-private interfaces, fail-open behavior, attribution errors,
> lost durable state, duplicate submission, and claims broader than the evidence.
> Distinguish script/fixture success from actual native observations. A successful
> HTTP response is not proof of a Claude turn, and missing output is not proof of
> refusal. Check that cleanup is proven and unknown offers are not retried.
>
> Return ACCEPT or CHANGES REQUIRED with file/line or evidence references. Separately
> classify the actual step result as PASS, FAIL, INCONCLUSIVE, or BLOCKED. ACCEPT of
> a valid failure report does not pass the gate. List exactly what you checked,
> what you could not independently verify, and whether the next dependent step may
> start. If evidence is missing, say so; do not invent tests or waive requirements.

## Luna review record

- Reviewer model and actual model identifier when available:
- Review date:
- Step / attempt / reviewed patch fingerprint:
- Prerequisites verified:
- Files and evidence inspected:
- Commands independently run and results:
- Native observations inspected; whether independently reproduced:
- Checks not rerun and reason:
- Findings, ordered by impact, with exact references:
- Required corrections / missing evidence:
- Validated step result: PASS / FAIL / INCONCLUSIVE / BLOCKED:
- Review verdict: ACCEPT / CHANGES REQUIRED:
- May the next dependent step start? Yes / No, with reason:
- Re-review reference after corrections, if any:

Luna's review is a quality check, not native safety evidence by itself. Never fill
this record as if Luna reviewed a step when another model authored the conclusion.
