# Converge — public submission

## Name

Converge

## One-line description

Multiple independent plans become one traceable GenLayer-consensus canonical plan without erasing disagreement.

## Short description

Converge is a contract-first GenLayer Intelligent Contract for bounded multi-plan synthesis. Wallets submit immutable structured plans for one objective; GenLayer validators independently assess a semantic synthesis; and the contract persists canonical steps, exact provenance, optional branches, conflicts, and unresolved issues. Converge records a plan but does not execute it.

## Full description

Operational decisions often have several plausible plans. A deterministic contract can enforce lifecycle rules and validate structure, but it cannot decide whether differently worded steps are semantically equivalent or which ideas belong in a shared path. A single LLM can produce a plausible answer, but it does not establish independent agreement or preserve an auditable relationship between the output and the submitted plans.

Converge accepts a bounded packet of immutable plans. Its synthesis result contains:

- canonical dependency-ordered steps;
- CORE steps that form the shared operational path;
- OPTIONAL steps that remain inspectable without being promoted into the core;
- supported_by references in the exact plan-id:step-id form;
- conflicts with each competing position and its sources; and
- unresolved disagreements that remain open.

The contract uses one gl.vm.run_nondet boundary for semantic synthesis. A leader produces the structured candidate. Validators independently evaluate the objective, submitted plans, and candidate. Deterministic post-consensus checks validate exact keys, enums, objective binding, size limits, source references, dependency references, and acyclicity before state is written.

The lifecycle is OPEN → SEALED → SYNTHESIZED → ACCEPTED or REJECTED. Only the creator can seal or decide. Each wallet can submit at most one plan per objective. ACCEPTED and REJECTED are terminal.

The live demonstration objective is Safe production migration. It has three independent plans and an ACCEPTED persisted result with 5 CORE steps, 2 OPTIONAL steps, 1 conflict, 1 unresolved issue, 22 valid provenance references, and an acyclic dependency graph.

## Why GenLayer

The semantic synthesis step is nondeterministic: different plans can use different wording while expressing overlapping operational intent, and the system must preserve meaningful disagreement rather than reduce it to string equality. A normal deterministic smart contract cannot perform that semantic judgment. A single LLM response is not enough because it lacks independent validation and agreement.

GenLayer supplies the validator-consensus boundary while the contract retains deterministic ownership of lifecycle, provenance, structure, and terminal state.

## What is technically novel

- Multi-plan semantic synthesis rather than single-answer generation.
- Exact supported_by provenance from every canonical, conflicting, or unresolved output back to submitted steps.
- CORE / OPTIONAL separation for common path versus useful branches.
- First-class preservation of conflict and unresolved disagreement.
- Independent semantic validator assessment.
- Deterministic structural validation after consensus.

## How to test

1. Open the public application: https://converge-jet.vercel.app
2. Open the read-only walkthrough: https://converge-jet.vercel.app/app/demo
3. Open the live objective: https://converge-jet.vercel.app/app/objectives/converge-live-20260924
4. Compare plans: https://converge-jet.vercel.app/app/objectives/converge-live-20260924/plans
5. Inspect canonical output and provenance: https://converge-jet.vercel.app/app/objectives/converge-live-20260924/synthesis
6. Inspect the contract source: https://github.com/Iniwura/converge/blob/main/contracts/converge.py
7. Run the contract tests from the repository root:

~~~text
PYTHONPATH=. /home/ini/corroborationgraph/.venv/bin/pytest --artifacts-dir /tmp/converge-artifacts -q
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint check contracts/converge.py
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint validate --json contracts/converge.py
PATH=/home/ini/corroborationgraph/.venv/bin:$PATH GENVM_VERSION=vstudio-dev /home/ini/corroborationgraph/.venv/bin/genvm-lint typecheck contracts/converge.py
GENVMROOT=/tmp/converge-genvmroot /home/ini/corroborationgraph/.venv/bin/genvm-lint schema --json contracts/converge.py
~~~

No wallet, objective creation, or three-wallet funding is required to understand the live result.

## Live links

- Public frontend: https://converge-jet.vercel.app
- Live demo: https://converge-jet.vercel.app/app/demo
- Live objective: https://converge-jet.vercel.app/app/objectives/converge-live-20260924
- Plans comparison: https://converge-jet.vercel.app/app/objectives/converge-live-20260924/plans
- Synthesis/provenance: https://converge-jet.vercel.app/app/objectives/converge-live-20260924/synthesis
- GitHub: https://github.com/Iniwura/converge
- Studio Explorer: https://explorer-studio.genlayer.com/address/0xc5594aA7c35d36279755F459d2aE083c2a226700

## Deployment

- Network: GenLayer Studio Dev
- Chain ID: 61997
- RPC: https://studio-dev.genlayer.com/api
- Contract: 0xc5594aA7c35d36279755F459d2aE083c2a226700
- Deployment transaction: 0x084cb80de890f2c72eb3372814faa20dca45fd14c6586fd6e30345458144bed7
- Deployed source SHA-256: dbd738229a3f31d47855440d41bff5ae148b22b731b8d3c4be9efaf241a9710e
- Production frontend: https://converge-jet.vercel.app
- Vercel project: converge
- Vercel deployment: dpl_A3ZUY73L4GCNEsnZ2zeZpnGZKeci
- Final frontend commit: 06cb36ffdc1a46fdb937f8e9a3675488f953a231
- Live objective: converge-live-20260924
- Live objective state: ACCEPTED
- Old/private development hosting (not the submission URL): https://converge-workspace.iniwuraakuru.chatgpt.site

## Public production write verification

- `public-write-test-20260925`: real Studio Dev creation through the production frontend persisted an `OPEN` objective. The first frontend build incorrectly reported `Consensus did not resolve the transaction: unknown`; the simplified SDK receipt exposed `status_name`, while the frontend read `statusName`. Receipt handling was fixed. No unrecovered full transaction hash is claimed here.
- `public-write-test-20260925-b`: created through the Vercel production frontend; authoritative confirmation completed before redirect. It is `OPEN`, creator `0xd0dd02322af812fc0dbddc69f9a055fbbe2c6673`, bounds `2–2`, and plan count `0`. The subsequent wallet-aware read found that `has_submitted` requires SDK `CalldataAddress`; the plain address string was invalid GenVM Address calldata. This was fixed without another write.

## Verified lifecycle

- CREATE OBJECTIVE: 0xa63e68e6b5788b8a284c014394743fcde42727c173f556a892cc917c018d44ef
- plan-a from dissent-deployer: 0xc3156fcfb075f60c89385e1c0ff8cec56c9f2914e65594dea5d36bae8b2fe52
- plan-b from recall-deployer: 0x19dfa8ae8b55292fbcb97882772e6a9a01f35ecf67c18d316265c86870f80599
- plan-c from dissent-studio: 0x136282874b4e20f294df1277c3f9004055a6a369a192f29e16d533f0cea28bf8
- Duplicate-wallet submission rejection: 0xa1fe5dd8714b5318e3d7bc067d4da26a3a8eb26e4aff3503e5f5d0d1340ef7a0
- SEAL: 0x0759720aa96dd348c89765e766859a6190d6276ab7dcbc597c4aa11c82e49185
- Submission-after-seal rejection: 0x01860ad8fbf646f215850917155ff8cd387a50f3a17ec70c009a803e46eccbc4
- Successful SYNTHESIZE: 0x3c529272e039bfd40a9a9f9ab969a5a8a7e22966cc3a28a02ebc73d153616f5d
- Second synthesis rejection: 0xe63c4ff870454887f3704a21c874797d5bcd9a1de80cedcb2d8838a0e5cbda7a
- Non-creator accept/reject rejections: 0x59bac5853ec5577ccd55b4ccb5e8258bf16ac4c5b00bb5f7165d40c63555f31b and 0xc20ab9d78f1a7de2127d60a23d2422d3cad8e76d2f7e0adaf57f22cdde210f98
- Creator ACCEPT: 0x4838f2274d666e1913add7810fef99863c0dad05def2d3dc8013b0128a70edee
- Post-acceptance rejection: 0x2939f575c0b22ad686d7eb8eafbc0bd8fea7d716349b9d53c7e4c150ed9c1317

## Complete persisted synthesis result

~~~json
{
  "canonical_steps": [
    {
      "id": "C1",
      "action": "Establish an operational baseline and record current production metrics",
      "depends_on": [],
      "status": "CORE",
      "supported_by": ["plan-a:audit", "plan-c:baseline"]
    },
    {
      "id": "C2",
      "action": "Capture and verify an encrypted snapshot or restore checkpoint",
      "depends_on": ["C1"],
      "status": "CORE",
      "supported_by": ["plan-a:snapshot", "plan-b:backup", "plan-c:rehearse"]
    },
    {
      "id": "C3",
      "action": "Deploy candidate version and initiate a staged traffic rollout",
      "depends_on": ["C2"],
      "status": "CORE",
      "supported_by": ["plan-a:canary", "plan-a:rollout", "plan-b:switch", "plan-c:canary"]
    },
    {
      "id": "C4",
      "action": "Verify health signals, parity, and performance against promotion gates",
      "depends_on": ["C3"],
      "status": "CORE",
      "supported_by": ["plan-a:verify", "plan-c:observe"]
    },
    {
      "id": "C5",
      "action": "Restore the prior version if a release gate fails",
      "depends_on": ["C4"],
      "status": "CORE",
      "supported_by": ["plan-a:rollback", "plan-b:rollback", "plan-c:rollback"]
    },
    {
      "id": "C6",
      "action": "Mirror traffic to candidate (shadowing) without serving responses",
      "depends_on": ["C1"],
      "status": "OPTIONAL",
      "supported_by": ["plan-c:shadow"]
    },
    {
      "id": "C7",
      "action": "Implement dual writes and backfill data representation",
      "depends_on": ["C2"],
      "status": "OPTIONAL",
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

## Verification results

- Contract tests: 30 passed.
- GenVM lint: passed, 3 checks.
- Schema validation: passed, 11 public methods (5 view, 6 write).
- Schema extraction: passed.
- GenVM/Python typecheck: no errors.
- Contract source hash: dbd738229a3f31d47855440d41bff5ae148b22b731b8d3c4be9efaf241a9710e.
- Frontend regression tests: 18 passed.
- Frontend TypeScript: passed.
- Frontend ESLint: passed.
- Frontend production build: passed.
- Required public Vercel routes all returned HTTP 200: `/`, `/app`, `/app/new`, `/app/demo`, the live objective, plans, and synthesis.
- Live accepted objective still reads as 3 plans, 5 CORE, 2 OPTIONAL, 1 conflict, and 1 unresolved issue.
- Production wallet write path was tested successfully.
- Production connected-wallet Address read path was fixed and verified.
- Screenshots: none included; reliable screenshot capture was unavailable and no placeholders were fabricated.

## Limitations

- The contract accepts structured plans from submitters; it does not autonomously generate plans or run external agents in v1.
- Converge synthesizes and records a plan; it does not execute the plan.
- Nondeterministic synthesis may fail to reach validator majority. It can be retried before a synthesis is persisted.
- The Portal landing page was publicly inspectable, but its current submission form and required fields were not exposed without authenticated builder access. Before submission, sign in manually and copy the current Portal fields rather than relying on remembered field names.

## Submission category

Standalone GenLayer Intelligent Contract / Intelligent Contract project.

## Portal/manual step remaining

After opening the public app and repository, sign in to the current GenLayer Portal as the builder, create the appropriate Intelligent Contract contribution, and paste the current Portal-required fields from this document. Do not enter wallet credentials into this repository or chat.
