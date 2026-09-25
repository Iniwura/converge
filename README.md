# Converge

**Multiple independent plans → GenLayer consensus → one traceable canonical plan without erasing disagreement.**

Converge is a contract-first GenLayer Intelligent Contract for bounded multi-agent plan synthesis. Submitters provide immutable structured plans for one objective. GenLayer produces a persisted synthesis that keeps its canonical path, source provenance, optional branches, conflicts, and unresolved questions inspectable.

> Converge does not run external autonomous agents in v1. Submitters provide the plans. Converge synthesizes and records a canonical plan; it does not execute that plan.

## What problem Converge solves

Real operational decisions rarely arrive as one clean plan. Different teams may agree on the broad sequence while disagreeing about freezes, rollout strategy, or the evidence required to promote a change. A system that stores only one answer loses the reasoning and disagreement that reviewers need to inspect.

Converge accepts several bounded, independently submitted plans and turns them into a structured result:

- a dependency-ordered canonical plan;
- exact `plan-id:step-id` provenance for every supported step;
- CORE steps shared by the synthesis;
- OPTIONAL steps that remain useful but are not promoted into the core;
- explicit conflicts with their competing positions; and
- unresolved disagreements that remain open instead of being invented away.

## Why GenLayer

A normal deterministic smart contract can validate schemas, enforce one-submit-per-wallet, seal a packet, check references, and reject dependency cycles. It cannot reliably decide that differently worded steps are semantically equivalent or determine which ideas belong in a shared operational path.

A single LLM is also insufficient: it can produce a plausible synthesis, but it does not provide independent semantic agreement or a durable on-chain record of what was supported by which submitted step.

Converge uses GenLayer for the nondeterministic semantic boundary:

1. A leader produces the structured candidate synthesis.
2. Validators independently evaluate the objective, submitted plans, and candidate against the synthesis criteria.
3. The contract performs deterministic post-consensus validation before persisting anything: exact keys, enums, objective binding, source references, canonical dependencies, size limits, and acyclicity.

The contract uses one `gl.vm.run_nondet` synthesis boundary. It does not execute the resulting plan.

## What is technically novel

- **Multi-plan semantic synthesis:** several independently authored plans become one inspectable structure.
- **Traceable provenance:** `supported_by` references resolve to exact submitted steps, not client-side similarity matches.
- **CORE / OPTIONAL separation:** shared operational structure is distinct from useful but non-core branches.
- **Preserved disagreement:** conflicts and unresolved issues are first-class persisted output.
- **Independent semantic validation:** validators assess the synthesis rather than trusting one model response.
- **Deterministic structural validation:** the contract checks the accepted result before writing it to state.

## Lifecycle

~~~text
OPEN → SEALED → SYNTHESIZED → ACCEPTED
                         └──→ REJECTED
~~~

- The creator defines the objective and plan bounds.
- Each wallet can submit at most one immutable plan for that objective.
- The creator seals once the minimum plan count is reached.
- GenLayer consensus produces and persists one synthesis.
- Only the creator can accept or reject a synthesized result.
- ACCEPTED and REJECTED are terminal states.

The contract supports 2–8 distinct submitting wallets and bounded acyclic plan dependencies. The live demonstration uses exactly three.

## Live demonstration

Objective: **Safe production migration**

> Produce a consensus-backed migration plan that preserves service availability and makes rollback explicit.

Live objective ID: `converge-live-20260924`

The deployed objective is `ACCEPTED` with three plans:

- `plan-a`: deployment inventory, encrypted snapshot, isolated canary, progressive rollout, verification, rollback.
- `plan-b`: schema freeze, backup, backward-compatible expansion, dual writes, gradual read switch, rollback, cleanup.
- `plan-c`: measurable baseline, shadow traffic, rollback rehearsal, guarded canary, observation, promotion, rollback.

Persisted synthesis:

- 5 CORE steps;
- 2 OPTIONAL steps;
- 1 conflict with 2 positions;
- 1 unresolved issue;
- 22 valid provenance references;
- acyclic canonical dependency graph;
- synthesis fingerprint `bcc894cf36db135ea6c4ff18e68d845098db1e0ca949e240a539586b63078c68`.

Canonical output:

~~~json
{
  "canonical_steps": [
    {
      "id": "C1",
      "action": "Establish an operational baseline and record current production metrics",
      "status": "CORE",
      "depends_on": [],
      "supported_by": ["plan-a:audit", "plan-c:baseline"]
    },
    {
      "id": "C2",
      "action": "Capture and verify an encrypted snapshot or restore checkpoint",
      "status": "CORE",
      "depends_on": ["C1"],
      "supported_by": ["plan-a:snapshot", "plan-b:backup", "plan-c:rehearse"]
    },
    {
      "id": "C3",
      "action": "Deploy candidate version and initiate a staged traffic rollout",
      "status": "CORE",
      "depends_on": ["C2"],
      "supported_by": ["plan-a:canary", "plan-a:rollout", "plan-b:switch", "plan-c:canary"]
    },
    {
      "id": "C4",
      "action": "Verify health signals, parity, and performance against promotion gates",
      "status": "CORE",
      "depends_on": ["C3"],
      "supported_by": ["plan-a:verify", "plan-c:observe"]
    },
    {
      "id": "C5",
      "action": "Restore the prior version if a release gate fails",
      "status": "CORE",
      "depends_on": ["C4"],
      "supported_by": ["plan-a:rollback", "plan-b:rollback", "plan-c:rollback"]
    },
    {
      "id": "C6",
      "action": "Mirror traffic to candidate (shadowing) without serving responses",
      "status": "OPTIONAL",
      "depends_on": ["C1"],
      "supported_by": ["plan-c:shadow"]
    },
    {
      "id": "C7",
      "action": "Implement dual writes and backfill data representation",
      "status": "OPTIONAL",
      "depends_on": ["C2"],
      "supported_by": ["plan-b:dualwrite", "plan-b:expand"]
    }
  ],
  "conflicts": [
    {
      "topic": "Pre-migration state management",
      "positions": [
        {
          "position": "Freeze all schema changes and announce maintenance boundary",
          "supported_by": ["plan-b:freeze"]
        },
        {
          "position": "Record metrics and objectives without a strict freeze",
          "supported_by": ["plan-a:audit", "plan-c:baseline"]
        }
      ]
    }
  ],
  "unresolved": [
    {
      "issue": "Specific criteria for 'promotion gates' vs 'health signals' not unified across plans",
      "supported_by": ["plan-a:verify", "plan-c:baseline"]
    }
  ]
}
~~~

## Reviewer walkthrough

1. Open the [public application](https://converge-public-review.iniwuraakuru.chatgpt.site).
2. Read the [live demo](https://converge-public-review.iniwuraakuru.chatgpt.site/app/demo).
3. Open the [live objective](https://converge-public-review.iniwuraakuru.chatgpt.site/app/objectives/converge-live-20260924).
4. Compare the [three submitted plans](https://converge-public-review.iniwuraakuru.chatgpt.site/app/objectives/converge-live-20260924/plans).
5. Inspect the [canonical synthesis and provenance](https://converge-public-review.iniwuraakuru.chatgpt.site/app/objectives/converge-live-20260924/synthesis).
6. Review the [contract source](https://github.com/Iniwura/converge/blob/main/contracts/converge.py).
7. Run the [contract tests](https://github.com/Iniwura/converge/tree/main/tests).

No wallet, objective creation, or funding is required to understand the live result.

## Deployment

- Network: GenLayer Studio Dev, chain ID `61997`
- RPC: `https://studio-dev.genlayer.com/api`
- Contract: `0xc5594aA7c35d36279755F459d2aE083c2a226700`
- Deployment transaction: `0x084cb80de890f2c72eb3372814faa20dca45fd14c6586fd6e30345458144bed7`
- Deployed contract source SHA-256: `dbd738229a3f31d47855440d41bff5ae148b22b731b8d3c4be9efaf241a9710e`
- [Studio Explorer contract page](https://explorer-studio.genlayer.com/address/0xc5594aA7c35d36279755F459d2aE083c2a226700)
- [Public application](https://converge-public-review.iniwuraakuru.chatgpt.site)
- [Private development Site](https://converge-workspace.iniwuraakuru.chatgpt.site)
- [GitHub repository](https://github.com/Iniwura/converge)

The private development Site is retained separately; the public reviewer deployment is the submission URL.

## Verification

Contract:

- 30 tests passed.
- GenVM lint passed with 3 checks.
- Schema validation passed: 11 public methods, 5 views, 6 writes.
- Schema extraction passed.
- Python/GenVM typecheck passed with no errors.
- Deployed source hash matches the repository contract source.

Frontend:

- TypeScript check passed.
- ESLint passed.
- Production build passed.
- Public route checks returned HTTP 200 for `/`, `/app`, the live objective, plans, synthesis, and demo.
- The frontend reads the live Studio Dev contract and does not replace it with hardcoded synthesis data.

## Limitations

- Plans are submitted by wallets; the v1 contract does not autonomously generate plans or run external agents.
- Converge synthesizes and records a plan; v1 does not execute the plan.
- Nondeterministic synthesis can fail to reach validator majority. Before persistence, the transaction can be retried; once persisted, the synthesis is immutable.
- The current public release does not include captured screenshots because reliable screenshot capture was unavailable in the submission environment; no placeholder images are used.

## Local verification

From `/home/ini/converge`:

~~~text
PYTHONPATH=. /home/ini/corroborationgraph/.venv/bin/pytest --artifacts-dir /tmp/converge-artifacts -q
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint check contracts/converge.py
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint validate --json contracts/converge.py
PATH=/home/ini/corroborationgraph/.venv/bin:$PATH GENVM_VERSION=vstudio-dev /home/ini/corroborationgraph/.venv/bin/genvm-lint typecheck contracts/converge.py
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint schema --json contracts/converge.py
~~~

The frontend commands are run from `/home/ini/converge/frontend`:

~~~text
npx tsc --noEmit
npm run lint
npm run build
~~~
