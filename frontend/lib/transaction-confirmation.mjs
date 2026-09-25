const STATUS_BY_NUMBER = {
  0: "UNINITIALIZED",
  1: "PENDING",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
  8: "CANCELED",
  9: "APPEAL_REVEALING",
  10: "APPEAL_COMMITTING",
  11: "VALIDATORS_TIMEOUT",
  12: "LEADER_TIMEOUT",
  13: "LEADER_REVEALING",
};

const EXECUTION_RESULT_BY_NUMBER = {
  0: "NOT_VOTED",
  1: "FINISHED_WITH_RETURN",
  2: "FINISHED_WITH_ERROR",
  3: "TIMEOUT",
  4: "NONDET_DISAGREE",
  5: "DETERMINISTIC_VIOLATION",
};

const UNRESOLVED_STATUSES = new Set([
  "UNDETERMINED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function firstDefined(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function mappedName(value, mapping) {
  if (typeof value === "number" && Number.isInteger(value)) return mapping[value];
  if (typeof value === "string" && /^\d+$/.test(value)) return mapping[Number(value)];
  if (typeof value === "string") return value.toUpperCase();
  return undefined;
}

export function receiptStatusName(receipt) {
  const record = asRecord(receipt);
  return mappedName(firstDefined(record, ["statusName", "status_name", "status"]), STATUS_BY_NUMBER);
}

export function receiptExecutionResultName(receipt) {
  const record = asRecord(receipt);
  return mappedName(
    firstDefined(record, ["txExecutionResultName", "tx_execution_result_name", "txExecutionResult", "execution_result"]),
    EXECUTION_RESULT_BY_NUMBER,
  );
}

export function classifyDecisionReceipt(receipt) {
  const status = receiptStatusName(receipt);
  const execution = receiptExecutionResultName(receipt);

  if (status === "ACCEPTED" || status === "FINALIZED") {
    if (execution === "FINISHED_WITH_RETURN") return "accepted-success";
    if (execution === undefined) return "processing";
    return "accepted-execution-failed";
  }
  if (UNRESOLVED_STATUSES.has(status)) return "undetermined";
  return "processing";
}

export function decisionOutcomeMessage(receipt) {
  const status = receiptStatusName(receipt) ?? "unknown";
  const execution = receiptExecutionResultName(receipt);
  const kind = classifyDecisionReceipt(receipt);
  if (kind === "accepted-execution-failed") {
    return `The transaction reached ${status}, but contract execution returned ${execution ?? "an unknown result"}.`;
  }
  if (kind === "undetermined") return `Consensus resolved as ${status}; the transaction is not confirmed successful.`;
  if (kind === "processing") return `Consensus confirmation is incomplete (status ${status}, execution ${execution ?? "unknown"}).`;
  return "Consensus accepted the transaction and contract execution returned successfully.";
}

export function isWalletRejection(error) {
  const record = asRecord(error);
  if (Number(record.code) === 4001) return true;
  const message = error instanceof Error ? error.message : String(record.message ?? error ?? "");
  return /user rejected|user denied|rejected the request|denied transaction/i.test(message);
}

export async function pollAuthoritativeState({
  read,
  expected,
  attempts = 36,
  intervalMs = 2000,
  sleep = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await read();
      if (expected(value)) return { kind: "confirmed", value };
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await sleep(intervalMs);
  }
  return { kind: "timeout", lastError };
}
