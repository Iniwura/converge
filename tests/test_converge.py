import copy
import json
from pathlib import Path

import pytest


CONTRACT = Path(__file__).resolve().parents[1] / "contracts" / "converge.py"


def deploy(direct_deploy):
    return direct_deploy(CONTRACT)


def create_objective(
    contract,
    direct_vm,
    sender,
    objective_id="objective-1",
    minimum=2,
    maximum=8,
):
    direct_vm.sender = sender
    return contract.create_objective(
        objective_id,
        "Coordinate a launch",
        "Produce one executable launch plan from independent proposals.",
        "Respect the fixed budget and the security review requirement.",
        minimum,
        maximum,
    )


def plan_steps(extra=False):
    steps = [
        {
            "id": "research",
            "action": "Review the launch requirements",
            "dependencies": [],
            "rationale": "Establish the shared baseline.",
        },
        {
            "id": "draft",
            "action": "Draft the launch sequence",
            "dependencies": ["research"],
        },
    ]
    if extra:
        steps.append(
            {
                "id": "optional-review",
                "action": "Run an additional review",
                "dependencies": ["draft"],
                "rationale": "Useful when capacity allows.",
            }
        )
    return steps


def submit_plan(
    contract,
    direct_vm,
    sender,
    plan_id="plan-a",
    steps=None,
    objective_id="objective-1",
):
    direct_vm.sender = sender
    return contract.submit_plan(
        objective_id,
        plan_id,
        plan_steps() if steps is None else steps,
    )


def valid_result():
    return {
        "canonical_steps": [
            {
                "id": "C1",
                "action": "Review the launch requirements",
                "supported_by": ["plan-a:research", "plan-b:research"],
                "status": "CORE",
                "depends_on": [],
            },
            {
                "id": "C2",
                "action": "Draft the launch sequence",
                "supported_by": ["plan-a:draft", "plan-b:draft"],
                "status": "CORE",
                "depends_on": ["C1"],
            },
        ],
        "conflicts": [],
        "unresolved": [],
    }


def validator_projection(result, accepted=True):
    return {
        "accepted": accepted,
        "canonical_steps": [
            {
                "id": step["id"],
                "supported_by": step["supported_by"],
                "status": step["status"],
                "depends_on": step["depends_on"],
            }
            for step in result["canonical_steps"]
        ],
        "conflicts": [
            {
                "positions": [
                    {
                        "position": position["position"],
                        "supported_by": position["supported_by"],
                    }
                    for position in conflict["positions"]
                ]
            }
            for conflict in result["conflicts"]
        ],
        "unresolved": [
            {"supported_by": issue["supported_by"]}
            for issue in result["unresolved"]
        ],
    }


def configure_synthesis(direct_vm, leader_result, validator_result=None):
    direct_vm.clear_mocks()
    if validator_result is None:
        validator_result = validator_projection(leader_result)
    direct_vm.mock_llm(
        r"CONVERGE_LEADER_BEGIN",
        json.dumps(leader_result),
    )
    direct_vm.mock_llm(
        r"CONVERGE_VALIDATOR_BEGIN",
        json.dumps(validator_result),
    )


def setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    submit_plan(contract, direct_vm, direct_alice, "plan-a")
    submit_plan(contract, direct_vm, direct_bob, "plan-b")
    direct_vm.sender = direct_alice
    contract.seal_submissions("objective-1")
    return contract


def test_objective_creation_and_views(direct_deploy, direct_vm, direct_alice):
    contract = deploy(direct_deploy)
    fingerprint = create_objective(contract, direct_vm, direct_alice)

    objective = contract.get_objective("objective-1")
    assert objective["definition_fingerprint"] == fingerprint
    assert objective["creator"] == "0x" + direct_alice.hex()
    assert objective["state"] == "OPEN"
    assert objective["min_plan_count"] == 2
    assert objective["max_plan_count"] == 8
    assert objective["plan_count"] == 0
    assert contract.get_plan_count("objective-1") == 0


@pytest.mark.parametrize(
    "minimum,maximum",
    [(1, 2), (0, 8), (3, 2), (2, 9), (True, 2), (2, False)],
)
def test_invalid_plan_count_bounds_are_rejected(
    direct_deploy,
    direct_vm,
    direct_alice,
    minimum,
    maximum,
):
    contract = deploy(direct_deploy)
    with direct_vm.expect_revert():
        create_objective(
            contract,
            direct_vm,
            direct_alice,
            minimum=minimum,
            maximum=maximum,
        )


def test_duplicate_objective_id_is_rejected(direct_deploy, direct_vm, direct_alice):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    with direct_vm.expect_revert("already exists"):
        create_objective(contract, direct_vm, direct_alice)


def test_plan_submission_is_structured_immutable_and_indexed(
    direct_deploy, direct_vm, direct_alice
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    fingerprint = submit_plan(contract, direct_vm, direct_alice)

    plan = contract.get_plan("objective-1", "plan-a")
    assert plan["fingerprint"] == fingerprint
    assert plan["steps"][0]["id"] == "research"
    assert plan["steps"][0]["rationale"] == "Establish the shared baseline."
    assert contract.get_plan_count("objective-1") == 1
    assert contract.has_submitted("objective-1", direct_alice)


def test_one_plan_per_wallet_and_duplicate_plan_attempt(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    submit_plan(contract, direct_vm, direct_alice, "plan-a")
    with direct_vm.expect_revert("already has a plan"):
        submit_plan(contract, direct_vm, direct_alice, "plan-a-2")
    with direct_vm.expect_revert("already exists"):
        submit_plan(contract, direct_vm, direct_bob, "plan-a")
    assert contract.get_plan_count("objective-1") == 1
    assert not contract.has_submitted("objective-1", direct_bob)


def test_too_few_plans_cannot_be_sealed(direct_deploy, direct_vm, direct_alice):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice, minimum=3, maximum=4)
    submit_plan(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Minimum plan count"):
        contract.seal_submissions("objective-1")
    assert contract.get_objective("objective-1")["state"] == "OPEN"


def test_maximum_plan_count_is_enforced(
    direct_deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice, minimum=2, maximum=2)
    submit_plan(contract, direct_vm, direct_alice, "plan-a")
    submit_plan(contract, direct_vm, direct_bob, "plan-b")
    with direct_vm.expect_revert("maximum"):
        submit_plan(contract, direct_vm, direct_charlie, "plan-c")
    assert contract.get_plan_count("objective-1") == 2


def test_only_creator_can_seal_and_no_plan_after_seal(
    direct_deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    submit_plan(contract, direct_vm, direct_alice, "plan-a")
    submit_plan(contract, direct_vm, direct_bob, "plan-b")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("creator"):
        contract.seal_submissions("objective-1")
    assert contract.get_objective("objective-1")["state"] == "OPEN"

    direct_vm.sender = direct_alice
    contract.seal_submissions("objective-1")
    with direct_vm.expect_revert("not open"):
        submit_plan(contract, direct_vm, direct_charlie, "plan-c")


def test_synthesis_before_seal_is_rejected(
    direct_deploy, direct_vm, direct_alice
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    with direct_vm.expect_revert("sealed"):
        contract.synthesize("objective-1")


def test_valid_synthesis_persists_structured_result_and_is_immutable(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    configure_synthesis(direct_vm, result)

    synthesis = contract.synthesize("objective-1")
    assert synthesis["result"] == result
    assert synthesis["fingerprint"]
    assert contract.get_synthesis("objective-1")["result"] == result
    assert contract.get_objective("objective-1")["state"] == "SYNTHESIZED"

    with direct_vm.expect_revert("already finalized"):
        contract.synthesize("objective-1")


def test_multiple_conflicts_and_unresolved_items_have_stable_projection(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    result["canonical_steps"] = [result["canonical_steps"][0]]
    result["conflicts"] = [
        {
            "topic": "zzz",
            "positions": [
                {"position": "z", "supported_by": ["plan-a:research"]},
                {"position": "a", "supported_by": ["plan-b:research"]},
            ],
        },
        {
            "topic": "aaa",
            "positions": [
                {"position": "z", "supported_by": ["plan-a:draft"]},
                {"position": "a", "supported_by": ["plan-b:draft"]},
            ],
        },
    ]
    result["unresolved"] = [
        {"issue": "zzz", "supported_by": ["plan-a:draft"]},
        {"issue": "aaa", "supported_by": ["plan-b:draft"]},
    ]
    configure_synthesis(direct_vm, result)

    synthesis = contract.synthesize("objective-1")

    assert len(synthesis["result"]["conflicts"]) == 2
    assert len(synthesis["result"]["unresolved"]) == 2


def test_validator_cannot_change_stable_projection(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    projection = validator_projection(result)
    projection["canonical_steps"][0]["status"] = "OPTIONAL"
    configure_synthesis(direct_vm, result, validator_result=projection)

    with direct_vm.expect_revert("Synthesis consensus failed"):
        contract.synthesize("objective-1")
    assert contract.get_objective("objective-1")["state"] == "SEALED"


def test_plan_dependency_must_reference_local_step(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = deploy(direct_deploy)
    create_objective(contract, direct_vm, direct_alice)
    invalid_steps = [
        {"id": "research", "action": "Research", "dependencies": ["missing"]},
        {"id": "draft", "action": "Draft", "dependencies": []},
    ]

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("unknown dependency"):
        contract.submit_plan("objective-1", "plan-b", invalid_steps)


@pytest.mark.parametrize(
    "mutator",
    [
        lambda result: {"canonical_steps": [], "conflicts": [], "unresolved": []},
        lambda result: {**result, "extra": True},
        lambda result: {
            **result,
            "canonical_steps": [
                {**result["canonical_steps"][0], "supported_by": ["p9:nope"]},
                result["canonical_steps"][1],
            ],
        },
        lambda result: {
            **result,
            "canonical_steps": [
                {**result["canonical_steps"][0], "depends_on": ["C9"]},
                result["canonical_steps"][1],
            ],
        },
        lambda result: {
            **result,
            "canonical_steps": [
                {**result["canonical_steps"][0], "depends_on": ["C1"]},
                result["canonical_steps"][1],
            ],
        },
        lambda result: {
            **result,
            "canonical_steps": [result["canonical_steps"][0], result["canonical_steps"][0]],
        },
        lambda result: {
            **result,
            "canonical_steps": [
                {**result["canonical_steps"][0], "status": "MAYBE"},
                result["canonical_steps"][1],
            ],
        },
    ],
)
def test_malformed_synthesis_schema_and_references_are_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob, mutator
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    malformed = mutator(copy.deepcopy(valid_result()))
    configure_synthesis(direct_vm, malformed)
    with direct_vm.expect_revert("Synthesis consensus failed"):
        contract.synthesize("objective-1")
    objective = contract.get_objective("objective-1")
    assert objective["state"] == "SEALED"
    assert objective["synthesis_fingerprint"] == ""


def test_cyclic_canonical_dependencies_are_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    result["canonical_steps"][0]["depends_on"] = ["C2"]
    result["canonical_steps"][1]["depends_on"] = ["C1"]
    configure_synthesis(direct_vm, result)
    with direct_vm.expect_revert("Synthesis consensus failed"):
        contract.synthesize("objective-1")


def test_result_size_bound_is_enforced(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    result["canonical_steps"] = [
        {
            "id": "C" + str(index),
            "action": "Shared action " + str(index),
            "supported_by": ["plan-a:research"],
            "status": "OPTIONAL",
            "depends_on": [],
        }
        for index in range(65)
    ]
    configure_synthesis(direct_vm, result)
    with direct_vm.expect_revert("Synthesis consensus failed"):
        contract.synthesize("objective-1")
    assert contract.get_objective("objective-1")["state"] == "SEALED"


def test_failed_validator_leaves_state_unchanged_and_is_retryable(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = valid_result()
    configure_synthesis(direct_vm, result, validator_projection(result, accepted=False))
    with direct_vm.expect_revert("Synthesis consensus failed"):
        contract.synthesize("objective-1")
    assert contract.get_objective("objective-1")["state"] == "SEALED"
    assert contract.get_objective("objective-1")["synthesis_fingerprint"] == ""

    configure_synthesis(direct_vm, result)
    contract.synthesize("objective-1")
    assert contract.get_objective("objective-1")["state"] == "SYNTHESIZED"


def test_creator_can_accept_only_after_synthesis(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("synthesized"):
        contract.accept_plan("objective-1")
    with direct_vm.expect_revert("synthesized"):
        contract.reject_plan("objective-1", "Not ready")

    configure_synthesis(direct_vm, valid_result())
    contract.synthesize("objective-1")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("creator"):
        contract.accept_plan("objective-1")
    with direct_vm.expect_revert("creator"):
        contract.reject_plan("objective-1", "No")

    direct_vm.sender = direct_alice
    contract.accept_plan("objective-1")
    assert contract.get_objective("objective-1")["state"] == "ACCEPTED"
    with direct_vm.expect_revert("synthesized"):
        contract.reject_plan("objective-1", "Too late")


def test_creator_can_reject_synthesis_and_rejection_is_terminal(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_sealed(direct_deploy, direct_vm, direct_alice, direct_bob)
    configure_synthesis(direct_vm, valid_result())
    contract.synthesize("objective-1")
    direct_vm.sender = direct_alice
    contract.reject_plan("objective-1", "The dependency budget changed.")
    objective = contract.get_objective("objective-1")
    assert objective["state"] == "REJECTED"
    assert objective["decision_reason"] == "The dependency budget changed."
    with direct_vm.expect_revert("synthesized"):
        contract.accept_plan("objective-1")
