export function walletReadSucceeded(bundle, value) {
  return { ...bundle, hasSubmitted: Boolean(value), walletReadError: "" };
}

export function walletReadFailed(bundle, error) {
  return {
    ...bundle,
    hasSubmitted: null,
    walletReadError: error instanceof Error ? error.message : String(error),
  };
}

export function canSubmitPlan({ state, hasSubmitted, walletConnected, onTargetNetwork }) {
  return state === "OPEN" && hasSubmitted === false && walletConnected && onTargetNetwork;
}
