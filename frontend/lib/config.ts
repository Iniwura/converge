import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionHashVariant, type CalldataEncodable } from "genlayer-js/types";
import type { Address, Account } from "viem";

export const RPC_URL = "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = 61997;
export const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
export const NETWORK_NAME = "Studio Dev";
export const CONTRACT_ADDRESS =
  "0xc5594aA7c35d36279755F459d2aE083c2a226700" as Address;
export const DEPLOYMENT_TX =
  "0x084cb80de890f2c72eb3372814faa20dca45fd14c6586fd6e30345458144bed7";
export const SOURCE_SHA =
  "dbd738229a3f31d47855440d41bff5ae148b22b731b8d3c4be9efaf241a9710e";
export const LIVE_OBJECTIVE_ID = "converge-live-20260924";

const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Dev",
  rpcUrls: { default: { http: [RPC_URL] as readonly string[] } },
} as typeof studioDevnet;

const LATEST_NONFINAL = TransactionHashVariant.LATEST_NONFINAL;

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type WalletConnection = {
  address: `0x${string}`;
  chainId: number | null;
  provider: Eip1193Provider;
};

let readClient: ReturnType<typeof createClient> | undefined;

export function getReadClient() {
  readClient ??= createClient({ chain });
  return readClient;
}

function accountFor(address: `0x${string}`): Account {
  return { address, type: "json-rpc" };
}

function parseResult<T>(value: unknown, label: string): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new Error(`${label} returned invalid JSON: ${String(error)}`);
    }
  }
  if (value && typeof value === "object") return value as T;
  throw new Error(`${label} returned an empty value.`);
}

export async function readMethod<T>(functionName: string, args: CalldataEncodable[] = []) {
  const result = await getReadClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    jsonSafeReturn: true,
    transactionHashVariant: LATEST_NONFINAL,
  });
  return parseResult<T>(result, functionName);
}

export function getBrowserProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x")
    ? Number.parseInt(value, 16)
    : Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function readWalletConnection(): Promise<WalletConnection | null> {
  const provider = getBrowserProvider();
  if (!provider) return null;
  const accounts = await provider.request({ method: "eth_accounts" });
  const address = Array.isArray(accounts) && typeof accounts[0] === "string"
    ? accounts[0]
    : null;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
  return { address: address as `0x${string}`, chainId, provider };
}

export async function connectWallet(): Promise<WalletConnection> {
  const provider = getBrowserProvider();
  if (!provider) throw new Error("No browser wallet was detected.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) && typeof accounts[0] === "string"
    ? accounts[0]
    : null;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("The wallet did not return a usable account address.");
  }
  const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
  return { address: address as `0x${string}`, chainId, provider };
}

export async function switchToStudioDev(provider: Eip1193Provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? (error as { code?: number }).code
      : undefined;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "GenLayer Studio Dev",
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: ["https://genlayer-explorer.vercel.app"],
      }],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  }
  const verified = parseChainId(await provider.request({ method: "eth_chainId" }));
  if (verified !== CHAIN_ID) {
    throw new Error(`Wallet remains on chain ${verified ?? "unknown"}; Studio Dev is ${CHAIN_ID}.`);
  }
}

export function watchWallet(
  onAccountsChanged: (address: `0x${string}` | null) => void,
  onChainChanged: (chainId: number | null) => void,
) {
  const provider = getBrowserProvider();
  if (!provider?.on) return () => undefined;
  const accountsHandler = (...args: unknown[]) => {
    const accounts = (args[0] as string[] | undefined) ?? [];
    onAccountsChanged(accounts[0] ? accounts[0] as `0x${string}` : null);
  };
  const chainHandler = (...args: unknown[]) => onChainChanged(parseChainId(args[0]));
  provider.on("accountsChanged", accountsHandler);
  provider.on("chainChanged", chainHandler);
  return () => {
    provider.removeListener?.("accountsChanged", accountsHandler);
    provider.removeListener?.("chainChanged", chainHandler);
  };
}

export type WriteProgress = {
  phase: "simulating" | "awaiting-wallet" | "submitted" | "pending" | "confirming-state" | "complete" | "failed";
  label: string;
  txHash?: string;
  error?: string;
};

export type WriteArgs = CalldataEncodable[];

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function stateExpectation(functionName: string, args: WriteArgs, objective: { state: string; plan_ids: string[] }) {
  if (functionName === "create_objective") return objective.state === "OPEN";
  if (functionName === "submit_plan") return objective.plan_ids.includes(String(args[1]));
  if (functionName === "seal_submissions") return objective.state === "SEALED";
  if (functionName === "synthesize") return objective.state === "SYNTHESIZED";
  if (functionName === "accept_plan") return objective.state === "ACCEPTED";
  if (functionName === "reject_plan") return objective.state === "REJECTED";
  return false;
}

async function confirmMutation(functionName: string, args: WriteArgs) {
  const objectiveId = String(args[0] ?? "");
  let lastError: unknown;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    try {
      const objective = await readMethod<{ state: string; plan_ids: string[] }>("get_objective", [objectiveId]);
      if (stateExpectation(functionName, args, objective)) return objective;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error(`Authoritative contract state was not confirmed.${lastError ? ` ${errorMessage(lastError)}` : ""}`);
}

export async function writeMethod(
  wallet: WalletConnection,
  functionName: string,
  args: WriteArgs,
  onProgress?: (progress: WriteProgress) => void,
) {
  await switchToStudioDev(wallet.provider);
  const clientProvider = wallet.provider as NonNullable<Parameters<typeof createClient>[0]>["provider"];
  const client = createClient({ chain, account: wallet.address, provider: clientProvider });
  const account = accountFor(wallet.address);
  let hash: `0x${string}` | undefined;
  try {
    onProgress?.({ phase: "simulating", label: "SIMULATING AGAINST STUDIO DEV" });
    const estimate = await client.estimateTransactionFeesForWrite({
      account,
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: 0n,
      transactionHashVariant: LATEST_NONFINAL,
    });
    if (estimate.feeValue <= 0n) throw new Error("Studio Dev returned a zero transaction fee.");
    await client.simulateWriteContract({
      account,
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: 0n,
      fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue },
      transactionHashVariant: LATEST_NONFINAL,
    });
    onProgress?.({ phase: "awaiting-wallet", label: "AWAITING WALLET APPROVAL" });
    const submittedHash = await client.writeContract({
      account,
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: 0n,
      fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue },
    });
    hash = submittedHash;
    onProgress?.({ phase: "submitted", label: "SUBMITTED", txHash: submittedHash });
    onProgress?.({ phase: "pending", label: "CONSENSUS PENDING", txHash: submittedHash });
    const receipt = await client.waitForDecision({ hash: submittedHash, interval: 3000 });
    const accepted = receipt.statusName === "ACCEPTED" || receipt.statusName === "FINALIZED";
    if (!accepted) throw new Error(`Consensus did not resolve the transaction: ${String(receipt.statusName ?? "unknown")}.`);
    if (!isSuccessful(receipt)) {
      throw new Error(`The transaction was accepted but contract execution failed: ${String(receipt.txExecutionResultName ?? "unknown")}.`);
    }
    onProgress?.({ phase: "confirming-state", label: "CONFIRMING AUTHORITATIVE STATE", txHash: hash });
    const confirmed = await confirmMutation(functionName, args);
    onProgress?.({ phase: "complete", label: "CONTRACT STATE CONFIRMED", txHash: hash });
    return { hash, receipt, objective: confirmed };
  } catch (error) {
    const message = errorMessage(error);
    onProgress?.({ phase: "failed", label: "TRANSACTION FAILED", txHash: hash, error: message });
    throw new Error(message);
  }
}
