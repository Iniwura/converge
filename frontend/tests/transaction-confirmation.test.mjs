import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDecisionReceipt,
  isWalletRejection,
  pollAuthoritativeState,
  receiptExecutionResultName,
  receiptStatusName,
} from "../lib/transaction-confirmation.mjs";

test("accepts a full accepted receipt with successful execution", () => {
  assert.equal(classifyDecisionReceipt({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }), "accepted-success");
});

test("accepts a finalized receipt with successful execution", () => {
  assert.equal(classifyDecisionReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }), "accepted-success");
});

test("handles the SDK simplified status_name field", () => {
  const receipt = { status_name: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" };
  assert.equal(receiptStatusName(receipt), "ACCEPTED");
  assert.equal(classifyDecisionReceipt(receipt), "accepted-success");
});

test("handles numeric lifecycle fields when convenience names are absent", () => {
  const receipt = { status: 5, txExecutionResult: 1 };
  assert.equal(receiptStatusName(receipt), "ACCEPTED");
  assert.equal(receiptExecutionResultName(receipt), "FINISHED_WITH_RETURN");
  assert.equal(classifyDecisionReceipt(receipt), "accepted-success");
});

test("does not treat accepted execution errors as success", () => {
  assert.equal(classifyDecisionReceipt({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_ERROR" }), "accepted-execution-failed");
});

test("keeps undetermined consensus explicit", () => {
  assert.equal(classifyDecisionReceipt({ statusName: "UNDETERMINED", txExecutionResultName: "NOT_VOTED" }), "undetermined");
});

test("keeps pending and incomplete receipts non-terminal", () => {
  assert.equal(classifyDecisionReceipt({ statusName: "PENDING" }), "processing");
  assert.equal(classifyDecisionReceipt({ statusName: "ACCEPTED" }), "processing");
});

test("confirms authoritative state only when the predicate becomes true", async () => {
  let reads = 0;
  const result = await pollAuthoritativeState({
    read: async () => ({ state: ++reads === 2 ? "OPEN" : "UNKNOWN" }),
    expected: (value) => value.state === "OPEN",
    attempts: 3,
    intervalMs: 0,
  });
  assert.equal(result.kind, "confirmed");
  assert.equal(result.value.state, "OPEN");
});

test("reports timeout when authoritative state never becomes visible", async () => {
  const result = await pollAuthoritativeState({
    read: async () => ({ state: "UNKNOWN" }),
    expected: () => false,
    attempts: 2,
    intervalMs: 0,
  });
  assert.equal(result.kind, "timeout");
});

test("keeps wallet rejection separate from submitted transaction failure", () => {
  assert.equal(isWalletRejection({ code: 4001, message: "User rejected the request" }), true);
  assert.equal(isWalletRejection(new Error("User denied transaction")), true);
  assert.equal(isWalletRejection(new Error("RPC unavailable")), false);
});
