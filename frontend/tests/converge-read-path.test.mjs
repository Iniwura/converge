import assert from "node:assert/strict";
import test from "node:test";

import { CalldataAddress } from "genlayer-js/types";

import { readHasSubmitted, toCalldataAddress } from "../lib/calldata-address.mjs";
import { canSubmitPlan, walletReadFailed, walletReadSucceeded } from "../lib/objective-state.mjs";

const objectiveId = "public-write-test-20260925-b";
const wallet = "0xd0dd02322af812fc0dbddc69f9a055fbbe2c6673";

function baseBundle() {
  return {
    objective: { objective_id: objectiveId, state: "OPEN" },
    plans: [{ plan_id: "plan-a" }],
    synthesis: null,
    hasSubmitted: null,
    walletReadError: "",
  };
}

test("converts a valid wallet into the SDK CalldataAddress type", () => {
  const value = toCalldataAddress(wallet);
  assert.ok(value instanceof CalldataAddress);
  assert.equal(value.bytes.length, 20);
});

test("reads has_submitted for a valid wallet and preserves false", async () => {
  let captured;
  const result = await readHasSubmitted(async (method, args) => {
    captured = { method, args };
    return false;
  }, objectiveId, wallet);
  assert.equal(result, false);
  assert.equal(captured.method, "has_submitted");
  assert.ok(captured.args[1] instanceof CalldataAddress);
});

test("preserves a true has_submitted result", async () => {
  const result = await readHasSubmitted(async () => true, objectiveId, wallet);
  assert.equal(result, true);
  assert.equal(walletReadSucceeded(baseBundle(), result).hasSubmitted, true);
});

test("rejects malformed wallet input locally", () => {
  assert.throws(() => toCalldataAddress("0x1234"), /20-byte hexadecimal address/);
  assert.throws(() => toCalldataAddress("not-an-address"), /20-byte hexadecimal address/);
});

test("optional wallet-read failure preserves authoritative objective data", () => {
  const bundle = baseBundle();
  const failed = walletReadFailed(bundle, new Error("wallet read unavailable"));
  assert.deepEqual(failed.objective, bundle.objective);
  assert.deepEqual(failed.plans, bundle.plans);
  assert.equal(failed.hasSubmitted, null);
  assert.equal(failed.walletReadError, "wallet read unavailable");
});

test("optional wallet-read failure cannot enable Submit Plan", () => {
  const failed = walletReadFailed(baseBundle(), new Error("wallet read unavailable"));
  assert.equal(canSubmitPlan({
    state: failed.objective.state,
    hasSubmitted: failed.hasSubmitted,
    walletConnected: true,
    onTargetNetwork: true,
  }), false);
});

test("Submit Plan requires a verified false result and the target network", () => {
  const verified = walletReadSucceeded(baseBundle(), false);
  assert.equal(canSubmitPlan({
    state: verified.objective.state,
    hasSubmitted: verified.hasSubmitted,
    walletConnected: true,
    onTargetNetwork: true,
  }), true);
  assert.equal(canSubmitPlan({
    state: verified.objective.state,
    hasSubmitted: verified.hasSubmitted,
    walletConnected: true,
    onTargetNetwork: false,
  }), false);
  assert.equal(canSubmitPlan({
    state: verified.objective.state,
    hasSubmitted: true,
    walletConnected: true,
    onTargetNetwork: true,
  }), false);
});
