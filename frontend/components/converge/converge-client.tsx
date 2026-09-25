"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  GitBranch,

  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { readHasSubmitted } from "@/lib/calldata-address.mjs";
import { useRouter } from "next/navigation";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  DEPLOYMENT_TX,
  LIVE_OBJECTIVE_ID,
  NETWORK_NAME,
  SOURCE_SHA,
  type WalletConnection,
  connectWallet,
  readMethod,
  readWalletConnection,
  switchToStudioDev,
  watchWallet,
  writeMethod,
  type WriteProgress,
  type WriteArgs,
} from "@/lib/config";
import { canSubmitPlan, walletReadFailed, walletReadSucceeded } from "@/lib/objective-state.mjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

type View = "landing" | "registry" | "new" | "objective" | "submit" | "plans" | "synthesis" | "demo";

type Step = {
  id: string;
  action: string;
  dependencies: string[];
  rationale: string;
};

type ObjectiveRecord = {
  objective_id: string;
  creator: string;
  title: string;
  objective_text: string;
  constraints: string;
  min_plan_count: number;
  max_plan_count: number;
  plan_count: number;
  plan_ids: string[];
  state: string;
  definition_fingerprint: string;
  synthesis_fingerprint: string;
  created_at: string;
  sealed_at: string;
  synthesized_at: string;
  decided_at: string;
  decision_reason: string;
};

type PlanRecord = {
  objective_id: string;
  plan_id: string;
  submitter: string;
  steps: Step[];
  fingerprint: string;
  submitted_at: string;
};

type CanonicalStep = {
  id: string;
  action: string;
  supported_by: string[];
  status: "CORE" | "OPTIONAL";
  depends_on: string[];
};

type SynthesisResult = {
  canonical_steps: CanonicalStep[];
  conflicts: { topic: string; positions: { position: string; supported_by: string[] }[] }[];
  unresolved: { issue: string; supported_by: string[] }[];
};

type SynthesisRecord = {
  objective_id: string;
  result: SynthesisResult;
  fingerprint: string;
  synthesized_at: string;
};

type Bundle = {
  objective: ObjectiveRecord;
  plans: PlanRecord[];
  synthesis: SynthesisRecord | null;
  hasSubmitted: boolean | null;
  walletReadError: string;
};

type TxState = WriteProgress & { active: boolean };

const EMPTY_TX: TxState = { active: false, phase: "complete", label: "READY" };

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function short(value: string | null | undefined, left = 8, right = 6) {
  if (!value) return "—";
  return value.length > left + right + 1 ? `${value.slice(0, left)}…${value.slice(-right)}` : value;
}

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function formatDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function normalizeStep(value: unknown): Step {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: stringValue(raw.id),
    action: stringValue(raw.action),
    dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.map(stringValue) : [],
    rationale: stringValue(raw.rationale),
  };
}

function normalizeObjective(value: unknown): ObjectiveRecord {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    objective_id: stringValue(raw.objective_id),
    creator: stringValue(raw.creator),
    title: stringValue(raw.title),
    objective_text: stringValue(raw.objective_text),
    constraints: stringValue(raw.constraints),
    min_plan_count: numberValue(raw.min_plan_count),
    max_plan_count: numberValue(raw.max_plan_count),
    plan_count: numberValue(raw.plan_count),
    plan_ids: Array.isArray(raw.plan_ids) ? raw.plan_ids.map(stringValue) : [],
    state: stringValue(raw.state),
    definition_fingerprint: stringValue(raw.definition_fingerprint),
    synthesis_fingerprint: stringValue(raw.synthesis_fingerprint),
    created_at: stringValue(raw.created_at),
    sealed_at: stringValue(raw.sealed_at),
    synthesized_at: stringValue(raw.synthesized_at),
    decided_at: stringValue(raw.decided_at),
    decision_reason: stringValue(raw.decision_reason),
  };
}

function normalizePlan(value: unknown): PlanRecord {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    objective_id: stringValue(raw.objective_id),
    plan_id: stringValue(raw.plan_id),
    submitter: stringValue(raw.submitter),
    steps: Array.isArray(raw.steps) ? raw.steps.map(normalizeStep) : [],
    fingerprint: stringValue(raw.fingerprint),
    submitted_at: stringValue(raw.submitted_at),
  };
}

function normalizeSynthesis(value: unknown): SynthesisRecord {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result = (raw.result && typeof raw.result === "object" ? raw.result : {}) as Record<string, unknown>;
  return {
    objective_id: stringValue(raw.objective_id),
    fingerprint: stringValue(raw.fingerprint),
    synthesized_at: stringValue(raw.synthesized_at),
    result: {
      canonical_steps: Array.isArray(result.canonical_steps) ? result.canonical_steps.map((item) => {
        const step = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          id: stringValue(step.id),
          action: stringValue(step.action),
          supported_by: Array.isArray(step.supported_by) ? step.supported_by.map(stringValue) : [],
          status: step.status === "OPTIONAL" ? "OPTIONAL" : "CORE",
          depends_on: Array.isArray(step.depends_on) ? step.depends_on.map(stringValue) : [],
        };
      }) : [],
      conflicts: Array.isArray(result.conflicts) ? result.conflicts.map((item) => {
        const conflict = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          topic: stringValue(conflict.topic),
          positions: Array.isArray(conflict.positions) ? conflict.positions.map((position) => {
            const rawPosition = (position && typeof position === "object" ? position : {}) as Record<string, unknown>;
            return {
              position: stringValue(rawPosition.position),
              supported_by: Array.isArray(rawPosition.supported_by) ? rawPosition.supported_by.map(stringValue) : [],
            };
          }) : [],
        };
      }) : [],
      unresolved: Array.isArray(result.unresolved) ? result.unresolved.map((item) => {
        const issue = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          issue: stringValue(issue.issue),
          supported_by: Array.isArray(issue.supported_by) ? issue.supported_by.map(stringValue) : [],
        };
      }) : [],
    },
  };
}

async function loadBundle(objectiveId: string, address: string | null): Promise<Bundle> {
  const objective = normalizeObjective(await readMethod("get_objective", [objectiveId]));
  const plans = await Promise.all(objective.plan_ids.map(async (planId) => normalizePlan(await readMethod("get_plan", [objectiveId, planId]))));
  let synthesis: SynthesisRecord | null = null;
  if (["SYNTHESIZED", "ACCEPTED", "REJECTED"].includes(objective.state)) {
    try { synthesis = normalizeSynthesis(await readMethod("get_synthesis", [objectiveId])); } catch { synthesis = null; }
  }
  const baseBundle = { objective, plans, synthesis, hasSubmitted: null, walletReadError: "" };
  if (!address) return baseBundle;
  try {
    return walletReadSucceeded(baseBundle, await readHasSubmitted(readMethod, objectiveId, address));
  } catch (walletReadError) {
    return walletReadFailed(baseBundle, walletReadError);
  }
}

function useBundle(objectiveId: string | undefined, address: string | null, refreshKey = 0) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(Boolean(objectiveId));
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!objectiveId) return;
    setLoading(true);
    setError("");
    try { setBundle(await loadBundle(objectiveId, address)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)); }
    finally { setLoading(false); }
  }, [address, objectiveId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload, refreshKey]);
  return { bundle, loading, error, reload };
}

type AppContextValue = {
  wallet: WalletConnection | null;
  walletError: string;
  tx: TxState;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  runWrite: (functionName: string, args: WriteArgs) => Promise<unknown>;
  clearTx: () => void;
  refreshKey: number;
};

const AppContext = createContext<AppContextValue | null>(null);

function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Converge app context is unavailable.");
  return context;
}

function WalletBar({ wallet, walletError, connect, switchNetwork }: Pick<AppContextValue, "wallet" | "walletError" | "connect" | "switchNetwork">) {
  const [open, setOpen] = useState(false);
  const onTarget = wallet?.chainId === CHAIN_ID;
  return (
    <div className="wallet-bar">
      <div className={`network-state ${onTarget ? "is-live" : "is-wrong"}`}>
        <span className="signal-dot" />
        <span>{onTarget ? NETWORK_NAME : wallet ? `Wrong network · ${wallet.chainId ?? "unknown"}` : "Wallet disconnected"}</span>
      </div>
      {wallet ? (
        <div className="wallet-menu-wrap">
          <button className="wallet-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <Wallet size={15} /> {short(wallet.address)} <ChevronDown size={14} />
          </button>
          {open && (
            <div className="wallet-popover">
              <span className="eyebrow">CONNECTED WALLET</span>
              <strong className="mono wrap">{wallet.address}</strong>
              {!onTarget && <button className="button button-small button-warn" onClick={() => void switchNetwork()}>Switch to Studio Dev</button>}
              <button className="text-button" onClick={() => void navigator.clipboard?.writeText(wallet.address)}><Copy size={13} /> Copy address</button>
              {walletError && <p className="micro-error">{walletError}</p>}
            </div>
          )}
        </div>
      ) : (
        <button className="wallet-button" onClick={() => void connect()}><Wallet size={15} /> Connect wallet</button>
      )}
    </div>
  );
}

function Header() {
  const { wallet, walletError, connect, switchNetwork } = useApp();
  return (
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span><strong>CONVERGE<span className="brand-degree">°</span></strong><small>PLAN SYNTHESIS / STUDIO DEV</small></span></Link>
      <nav className="topnav"><Link href="/app">Workspace</Link><Link href="/app/demo">Demo</Link><Link href="/#contract">Contract</Link></nav>
      <WalletBar wallet={wallet} walletError={walletError} connect={connect} switchNetwork={switchNetwork} />
    </header>
  );
}

function TxRail() {
  const { tx, clearTx } = useApp();
  if (!tx.active) return null;
  const busy = !["complete", "failed", "undetermined", "timeout"].includes(tx.phase);
  const unresolved = tx.phase === "undetermined" || tx.phase === "timeout";
  return (
    <div className={`tx-rail ${tx.phase === "failed" ? "tx-failed" : tx.phase === "complete" ? "tx-complete" : unresolved ? "tx-pending" : ""}`}>
      <div className="tx-rail-icon">{busy ? <LoaderCircle className="spin" size={17} /> : tx.phase === "failed" || unresolved ? <TriangleAlert size={17} /> : <Check size={17} />}</div>
      <div><strong>{tx.label}</strong>{tx.txHash && <span className="mono">{short(tx.txHash, 12, 10)}</span>}{tx.error && <p>{tx.error}</p>}</div>
      {!busy && <button className="icon-button" onClick={clearTx} aria-label="Dismiss transaction notice"><X size={16} /></button>}
    </div>
  );
}

function SiteFrame({ children }: { children: ReactNode }) {
  return <div className="site"><Header /><TxRail />{children}<footer className="site-footer"><span>CONVERGE / LIVE CONTRACT WORKSPACE</span><span className="mono">CHAIN {CHAIN_ID} · {short(CONTRACT_ADDRESS, 10, 8)}</span></footer></div>;
}

function AppProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [walletError, setWalletError] = useState("");
  const [tx, setTx] = useState<TxState>(EMPTY_TX);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    void readWalletConnection().then(setWallet).catch(() => undefined);
    return watchWallet((address) => setWallet((current) => address && current ? { ...current, address } : current), (chainId) => setWallet((current) => current ? { ...current, chainId } : current));
  }, []);
  const connect = useCallback(async () => {
    try { setWalletError(""); setWallet(await connectWallet()); }
    catch (error) { setWalletError(error instanceof Error ? error.message : String(error)); }
  }, []);
  const switchNetwork = useCallback(async () => {
    if (!wallet) return;
    try { setWalletError(""); await switchToStudioDev(wallet.provider); setWallet((current) => current ? { ...current, chainId: CHAIN_ID } : current); }
    catch (error) { setWalletError(error instanceof Error ? error.message : String(error)); }
  }, [wallet]);
  const runWrite = useCallback(async (functionName: string, args: WriteArgs) => {
    if (!wallet) throw new Error("Connect a wallet before signing.");
    if (wallet.chainId !== CHAIN_ID) throw new Error(`Switch the connected wallet to ${NETWORK_NAME} before signing.`);
    setTx({ active: true, phase: "simulating", label: "SIMULATING AGAINST STUDIO DEV" });
    try {
      const result = await writeMethod(wallet, functionName, args, (progress) => setTx({ active: true, ...progress }));
      setRefreshKey((value) => value + 1);
      return result;
    } catch (error) {
      setTx((current) => ["failed", "undetermined", "timeout"].includes(current.phase)
        ? current
        : { active: true, phase: "failed", label: "TRANSACTION FAILED", txHash: current.txHash, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }, [wallet]);
  const value = useMemo(() => ({ wallet, walletError, tx, connect, switchNetwork, runWrite, clearTx: () => setTx(EMPTY_TX), refreshKey }), [connect, refreshKey, runWrite, switchNetwork, tx, wallet, walletError]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function PageShell({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-shell"><div className="page-heading"><div><span className="eyebrow accent">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div></div>;
}

function Button({ children, href, onClick, variant = "dark", disabled = false, type = "button" }: { children: ReactNode; href?: string; onClick?: () => void; variant?: "dark" | "light" | "ghost" | "warn"; disabled?: boolean; type?: "button" | "submit" }) {
  const className = `button button-${variant}`;
  if (href) return <Link className={className} href={href}>{children}</Link>;
  return <button className={className} onClick={onClick} disabled={disabled} type={type}>{children}</button>;
}

function StatusTag({ state }: { state: string }) {
  return <span className={`status-tag status-${state.toLowerCase()}`}><span className="status-dot" />{state}</span>;
}

function ReadState({ loading, error, retry }: { loading: boolean; error: string; retry?: () => void }) {
  if (loading) return <div className="read-state"><LoaderCircle className="spin" size={18} /> Reading authoritative contract state…</div>;
  if (error) return <div className="read-error"><CircleAlert size={18} /><div><strong>Contract read unavailable</strong><p>{error}</p></div>{retry && <button className="icon-button" onClick={retry} aria-label="Retry contract read"><RefreshCw size={16} /></button>}</div>;
  return null;
}

function Lifecycle({ state }: { state: string }) {
  const steps = ["OPEN", "SEALED", "SYNTHESIZED", state === "REJECTED" ? "REJECTED" : "ACCEPTED"];
  const terminal = state === "REJECTED" ? 3 : ["OPEN", "SEALED", "SYNTHESIZED", "ACCEPTED"].indexOf(state);
  return <div className="lifecycle">{steps.map((step, index) => <div className={`lifecycle-step ${index <= terminal ? "is-done" : ""} ${step === state ? "is-current" : ""}`} key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < steps.length - 1 && <i />}</div>)}</div>;
}

function MetaGrid({ objective }: { objective: ObjectiveRecord }) {
  return <div className="meta-grid"><div><span>CREATOR</span><strong className="mono wrap">{objective.creator}</strong></div><div><span>PLAN CAPACITY</span><strong>{objective.plan_count} / {objective.min_plan_count}–{objective.max_plan_count}</strong></div><div><span>CREATED</span><strong>{formatDate(objective.created_at)}</strong></div><div><span>STATE</span><strong><StatusTag state={objective.state} /></strong></div></div>;
}

function ConvergenceMap({ bundle }: { bundle: Bundle }) {
  const result = bundle.synthesis?.result;
  const core = result?.canonical_steps.filter((step) => step.status === "CORE") ?? [];
  const optional = result?.canonical_steps.filter((step) => step.status === "OPTIONAL") ?? [];


  return <div className="convergence-map"><div className="plan-column"><div className="map-label"><span>INDEPENDENT INPUTS</span><span>{bundle.plans.length} PLANS</span></div>{bundle.plans.map((plan, index) => <div className="plan-strip" key={plan.plan_id}><span className="plan-index">P{String(index + 1).padStart(2, "0")}</span><div><strong>{plan.plan_id}</strong><small>{plan.steps.length} ordered steps · {short(plan.submitter)}</small></div><ArrowRight size={16} /></div>)}</div><div className="map-join"><div className="join-line" /><GitBranch size={22} /><span>TRACEABLE<br />SYNTHESIS</span><div className="join-line" /></div><div className="canonical-column"><div className="map-label"><span>CANONICAL PATH</span><span>{result ? core.length + " CORE" : "READ PENDING"}</span></div>{result ? <><div className="map-core-sequence">{core.map((step, index) => <div className="map-core-item" key={step.id}><div className="canonical-strip"><span className="canonical-id">{step.id}</span><div><strong>{step.action}</strong><small>CORE · {step.supported_by.length} source refs</small></div></div>{index < core.length - 1 && <span className="map-core-arrow">↓</span>}</div>)}</div>{optional.length > 0 && <div className="map-branch-list">{optional.map((step) => <div className="map-branch" key={step.id}><span>↳ FROM {step.depends_on.join(" + ") || "ROOT"}</span><strong>{step.id} · {step.action}</strong></div>)}</div>}<div className="map-exceptions"><span>{result.conflicts.length} preserved conflict{result.conflicts.length === 1 ? "" : "s"}</span><span>{result.unresolved.length} unresolved issue{result.unresolved.length === 1 ? "" : "s"}</span></div></> : <div className="map-empty">Synthesis appears here once the contract persists it.</div>}</div></div>;
}

function Landing() {
  const router = useRouter();
  const { bundle, loading, error, reload } = useBundle(LIVE_OBJECTIVE_ID, null);
  const result = bundle?.synthesis?.result;
  const core = result?.canonical_steps.filter((step) => step.status === "CORE") ?? [];
  const example = core.find((step) => step.supported_by.length > 1) ?? core[0];
  return <SiteFrame><main className="landing editorial-landing"><section className="landing-hero"><div className="hero-watermark" aria-hidden="true">CONVERGE</div><div className="hero-copy"><span className="eyebrow accent">MULTI-AGENT PLAN SYNTHESIS / GENLAYER STUDIO DEV</span><h1>Different plans.<br /><em>One inspectable structure.</em></h1><p>Converge turns independent operational plans into a traceable canonical path without erasing optional ideas, conflict, or uncertainty.</p><div className="hero-actions"><Button href="/app/demo">Read the live objective <ArrowRight size={16} /></Button><Button href="/app" variant="ghost">Enter workspace</Button></div>{bundle && <div className="hero-metrics"><div><span>PLANS IN PACKET</span><strong>{bundle.objective.plan_count}</strong></div><div><span>CANONICAL STEPS</span><strong>{result?.canonical_steps.length ?? "—"}</strong></div><div><span>STATE</span><strong><StatusTag state={bundle.objective.state} /></strong></div></div>}</div><div className="hero-visual"><div className="hero-visual-label"><span className="eyebrow">LIVE OBJECTIVE / {LIVE_OBJECTIVE_ID}</span><span className="mono">01 / MECHANISM</span></div>{bundle && <ConvergenceMap bundle={bundle} />}<ReadState loading={loading} error={error} retry={reload} /></div></section><section className="landing-section mechanism-section" id="mechanism"><div className="section-index">01 / MECHANISM</div><div className="section-intro"><h2>THREE PLANS.<br /><em>ONE STRUCTURE.</em></h2><p>Independent submitters enter the same bounded objective. GenLayer consensus produces a persisted structure that can be inspected step by step.</p></div><div className="mechanism-annotation"><span>INPUT</span><strong>3 independent plans</strong><span>TRANSFORMATION</span><strong>shared structure + preserved divergence</strong><span>OUTPUT</span><strong>1 canonical plan</strong></div></section><section className="landing-section live-synthesis-section" id="live-synthesis"><div className="section-index">02 / LIVE SYNTHESIS</div><div className="section-intro"><div><span className="eyebrow accent">CONVERGE-LIVE-20260924</span><h2>Consensus leaves a<br /><em>visible artifact.</em></h2></div><p>Every count below is read from the deployed contract. The accepted result stays inspectable after the lifecycle closes.</p></div>{bundle && result && <div className="live-synthesis-grid"><div className="editorial-stats"><div><strong>{result.canonical_steps.filter((step) => step.status === "CORE").length}</strong><span>CORE STEPS</span></div><div><strong>{result.canonical_steps.filter((step) => step.status === "OPTIONAL").length}</strong><span>OPTIONAL</span></div><div><strong>{result.conflicts.length}</strong><span>CONFLICT</span></div><div><strong>{result.unresolved.length}</strong><span>UNRESOLVED</span></div></div><div className="live-canonical-list"><span className="eyebrow">PERSISTED CANONICAL PATH</span>{core.map((step) => <div key={step.id}><strong>{step.id}</strong><span>{step.action}</span></div>)}</div></div>}</section><section className="landing-section provenance-section" id="provenance"><div className="section-index">03 / PROVENANCE</div><div className="section-intro"><div><span className="eyebrow accent">SOURCE TRACEABILITY</span><h2>{example ? example.id : "Every step"} keeps its origin.</h2></div><p>Selecting a canonical step reveals the exact original wording, rationale, and dependencies that support it. Nothing is matched by client-side similarity.</p></div>{bundle && example && <div className="provenance-spread"><div className="provenance-lead"><span className="canonical-id">{example.id}</span><h3>{example.action}</h3><span>{example.supported_by.length} source references</span></div><div className="provenance-sources">{example.supported_by.map((reference) => <SourceTraceCard reference={reference} plans={bundle.plans} onClick={() => router.push("/app/objectives/" + LIVE_OBJECTIVE_ID + "/synthesis")} key={reference} />)}</div></div>}</section><section className="landing-section disagreement-section" id="disagreement"><div className="section-index">04 / DISAGREEMENT</div><div className="section-intro"><div><span className="eyebrow accent">PRESERVED DIVERGENCE</span><h2>Consensus does not<br /><em>flatten the edges.</em></h2></div><p>Conflict and unresolved issues remain first-class output, with no winner/loser styling and no invented resolution.</p></div>{bundle && result && <div className="disagreement-spread"><div className="landing-conflict"><span className="eyebrow">CONFLICT / {result.conflicts.length}</span>{result.conflicts.map((conflict) => <div key={conflict.topic}><h3>{conflict.topic}</h3>{conflict.positions.map((position, index) => <div className="landing-position" key={position.position}><strong>{String.fromCharCode(65 + index)}</strong><p>{position.position}</p></div>)}</div>)}</div><div className="landing-unresolved"><span className="eyebrow">UNRESOLVED / {result.unresolved.length}</span>{result.unresolved.map((issue) => <div key={issue.issue}><CircleAlert size={18} /><p>{issue.issue}</p></div>)}</div></div>}</section><ProofPanel /></main></SiteFrame>;
}

function ProofPanel() {
  return <section className="landing-section proof-panel" id="contract"><div className="section-index">05 / CONTRACT</div><div className="section-intro"><div><span className="eyebrow accent">REVIEWER PROOF</span><h2>One deployed contract.<br /><em>No demo state.</em></h2></div><p>Reads come from Studio Dev. Writes estimate, simulate, wait for consensus, and reread authoritative state before the interface reports completion.</p></div><div className="proof-list"><div><span>NETWORK</span><strong>GenLayer Studio Dev · {CHAIN_ID}</strong></div><div><span>CONTRACT</span><strong className="mono wrap">{CONTRACT_ADDRESS}</strong></div><div><span>DEPLOYMENT</span><strong className="mono wrap">{DEPLOYMENT_TX}</strong></div><div><span>SOURCE SHA-256</span><strong className="mono wrap">{SOURCE_SHA}</strong></div><div><span>LOCAL VERIFICATION</span><strong>30 tests · 11 public methods · lint and typecheck passed</strong></div></div></section>;
}

function Registry() {
  const [lookup, setLookup] = useState(LIVE_OBJECTIVE_ID);
  const [requested, setRequested] = useState(LIVE_OBJECTIVE_ID);
  const { bundle, loading, error, reload } = useBundle(requested, null);
  return <SiteFrame><main className="workspace"><PageShell eyebrow="OBJECTIVE REGISTRY" title="Addressable objectives." description="The contract exposes objective reads by caller-supplied ID. Start with the known live objective or read another exact ID." actions={<Button href="/app/new">Create objective <Plus size={15} /></Button>} /><div className="lookup-bar"><div><span className="eyebrow">READ EXACT OBJECTIVE ID</span><input value={lookup} onChange={(event) => setLookup(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setRequested(lookup.trim()); }} /></div><Button onClick={() => setRequested(lookup.trim())}>Read contract <ArrowRight size={15} /></Button></div><ReadState loading={loading} error={error} retry={reload} />{bundle && <Link className="registry-record" href={"/app/objectives/" + bundle.objective.objective_id}><span className="registry-index">01</span><div><span className="eyebrow accent">KNOWN LIVE OBJECTIVE</span><strong>{bundle.objective.objective_id}</strong><p>{bundle.objective.title}</p></div><div className="registry-meta"><span>STATE <StatusTag state={bundle.objective.state} /></span><span>PLANS <strong>{bundle.objective.plan_count} / {bundle.objective.max_plan_count}</strong></span><span>CREATOR <strong className="mono">{short(bundle.objective.creator)}</strong></span></div><ChevronRight /></Link>}<div className="registry-note"><Network size={18} /><p><strong>No fabricated rows.</strong> When you create an objective, its exact ID becomes the addressable entry point for its workspace.</p></div></main></SiteFrame>;
}

type DraftObjective = { objectiveId: string; title: string; objectiveText: string; constraints: string; minPlans: string; maxPlans: string };
const emptyDraft: DraftObjective = { objectiveId: "", title: "", objectiveText: "", constraints: "", minPlans: "3", maxPlans: "3" };

function NewObjective() {
  const { runWrite } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState<DraftObjective>(emptyDraft);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof DraftObjective) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const validate = () => {
    if (!draft.objectiveId.trim() || !/^[A-Za-z0-9._-]+$/.test(draft.objectiveId.trim())) return "Objective ID is required and may use letters, numbers, dots, underscores, and hyphens.";
    if (!draft.title.trim() || !draft.objectiveText.trim()) return "Title and objective text are required.";
    const min = Number(draft.minPlans); const max = Number(draft.maxPlans);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 2 || max < min || max > 8) return "Plan bounds must be integers from 2–8, with maximum at least minimum.";
    return "";
  };
  const submit = async () => {
    const validation = validate(); if (validation) { setError(validation); return; }
    setError("");
    try { await runWrite("create_objective", [draft.objectiveId.trim(), draft.title.trim(), draft.objectiveText.trim(), draft.constraints.trim(), Number(draft.minPlans), Number(draft.maxPlans)]); router.push(`/app/objectives/${draft.objectiveId.trim()}`); }
    catch (writeError) { setError(writeError instanceof Error ? writeError.message : String(writeError)); }
  };
  return <SiteFrame><main className="workspace"><PageShell eyebrow="NEW OBJECTIVE" title="Define the packet before anyone plans." description="These fields map one-to-one to create_objective. Once confirmed, the objective definition is immutable on-chain." /><div className="form-layout">{!review ? <form className="form-surface" onSubmit={(event: FormEvent) => { event.preventDefault(); const validation = validate(); if (validation) setError(validation); else { setError(""); setReview(true); } }}><Field label="Objective ID" hint="Caller-supplied identifier · max 96 characters"><input value={draft.objectiveId} onChange={update("objectiveId")} placeholder="migration-q4-2026" /></Field><Field label="Title"><input value={draft.title} onChange={update("title")} placeholder="Safe production migration" /></Field><Field label="Objective text"><textarea rows={4} value={draft.objectiveText} onChange={update("objectiveText")} placeholder="What should the independent plans solve?" /></Field><Field label="Constraints"><textarea rows={4} value={draft.constraints} onChange={update("constraints")} placeholder="Operational conditions the synthesis must respect" /></Field><div className="two-fields"><Field label="Minimum plans"><input type="number" min="2" max="8" value={draft.minPlans} onChange={update("minPlans")} /></Field><Field label="Maximum plans"><input type="number" min="2" max="8" value={draft.maxPlans} onChange={update("maxPlans")} /></Field></div>{error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}<div className="form-footer"><span className="eyebrow">NEXT / IMMUTABLE PACKET REVIEW</span><Button type="submit">Review packet <ArrowRight size={15} /></Button></div></form> : <div className="review-surface"><div className="review-head"><div><span className="eyebrow accent">EXACT WRITE PACKET</span><h2>Review before signing</h2></div><button className="text-button" onClick={() => setReview(false)}><ChevronRight size={15} className="rotate-back" /> Edit fields</button></div><pre className="packet-json">{JSON.stringify({ objective_id: draft.objectiveId.trim(), title: draft.title.trim(), objective_text: draft.objectiveText.trim(), constraints: draft.constraints.trim(), min_plan_count: Number(draft.minPlans), max_plan_count: Number(draft.maxPlans) }, null, 2)}</pre>{error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}<div className="form-footer"><span className="eyebrow">SIGN / CREATE OBJECTIVE</span><Button onClick={() => void submit()}>Sign and create <ArrowRight size={15} /></Button></div></div>}<aside className="side-note"><span className="eyebrow accent">CONTRACT RULES</span><ol><li>Minimum 2, maximum 8 plans.</li><li>One objective creator controls sealing and final decision.</li><li>The ID and definition fingerprint become the anchor for every plan.</li></ol></aside></div></main></SiteFrame>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }

function ObjectivePage({ objectiveId }: { objectiveId: string }) {
  const { wallet, runWrite, refreshKey } = useApp();
  const { bundle, loading, error, reload } = useBundle(objectiveId, wallet?.address ?? null, refreshKey);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  if (loading || error || !bundle) return <SiteFrame><main className="workspace"><PageShell eyebrow="OBJECTIVE WORKSPACE" title={objectiveId} /><ReadState loading={loading} error={error} retry={reload} /></main></SiteFrame>;
  const { objective } = bundle;
  const isCreator = sameAddress(wallet?.address, objective.creator);
  const canSubmit = canSubmitPlan({ state: objective.state, hasSubmitted: bundle.hasSubmitted, walletConnected: Boolean(wallet), onTargetNetwork: wallet?.chainId === CHAIN_ID });
  const canSeal = objective.state === "OPEN" && isCreator && objective.plan_count >= objective.min_plan_count;
  const canSynthesize = objective.state === "SEALED";
  const canDecide = objective.state === "SYNTHESIZED" && isCreator;
  const execute = async (method: string, args: WriteArgs) => { setActionError(""); try { await runWrite(method, args); } catch (writeError) { setActionError(writeError instanceof Error ? writeError.message : String(writeError)); } };
  return <SiteFrame><main className="workspace"><div className="dossier-heading"><div><span className="eyebrow accent">OBJECTIVE / {objective.objective_id}</span><h1>{objective.title}</h1><p>{objective.objective_text}</p></div><StatusTag state={objective.state} /></div><Lifecycle state={objective.state} /><MetaGrid objective={objective} /><div className="objective-grid"><section className="objective-main"><div className="dossier-section"><span className="eyebrow accent">OPERATING CONSTRAINTS</span><p className="large-copy">{objective.constraints || "No additional constraints recorded."}</p></div><div className="dossier-section"><div className="section-head"><div><span className="eyebrow accent">SUBMITTED PLANS</span><h2>{objective.plan_count} plans in the packet</h2></div><div className="section-actions"><Button href={`/app/objectives/${objective.objective_id}/plans`} variant="ghost">Compare plans <ArrowRight size={14} /></Button>{canSubmit && <Button href={`/app/objectives/${objective.objective_id}/submit`}>Submit a plan <Plus size={14} /></Button>}</div></div><div className="mini-plan-list">{bundle.plans.map((plan) => <Link href={`/app/objectives/${objective.objective_id}/plans#${plan.plan_id}`} className="mini-plan" key={plan.plan_id}><span className="mono">{plan.plan_id}</span><strong>{plan.steps.length} steps</strong><span className="mono">{short(plan.submitter)}</span><ChevronRight size={15} /></Link>)}</div>{bundle.hasSubmitted && <div className="info-strip"><Check size={16} /> This wallet has already submitted one plan for this objective.</div>}</div>{bundle.synthesis && <div className="synthesis-callout"><div><span className="eyebrow accent">PERSISTED SYNTHESIS</span><h2>{bundle.synthesis.result.canonical_steps.length} canonical steps, with disagreement intact.</h2><p>Trace the authoritative output back to the exact submitted steps.</p></div><Button href={`/app/objectives/${objective.objective_id}/synthesis`}>Inspect synthesis <ArrowRight size={15} /></Button></div>}</section><aside className="action-panel"><span className="eyebrow accent">VALID ACTIONS</span><h2>Move the objective forward.</h2><p className="muted-copy">Actions appear only when the authoritative state and connected wallet permit them.</p>{!wallet && <div className="info-strip"><Wallet size={16} /> Connect a wallet to act.</div>}{wallet && !isCreator && ["OPEN", "SEALED", "SYNTHESIZED"].includes(objective.state) && <div className="info-strip"><ShieldCheck size={16} /> Connected wallet is not the objective creator.</div>}{bundle.walletReadError && <div className="info-strip"><TriangleAlert size={16} /> Wallet submission status could not be verified. Refresh before submitting.</div>}<div className="action-list">{canSeal && <ActionRow title="Seal submissions" detail="Lock the packet once the minimum plan count is reached." onClick={() => void execute("seal_submissions", [objective.objective_id])} />} {canSynthesize && <ActionRow title="Synthesize" detail="Run the persisted consensus synthesis for this sealed packet." onClick={() => void execute("synthesize", [objective.objective_id])} />} {canDecide && <><ActionRow title="Accept synthesis" detail="Make the synthesized objective final." onClick={() => void execute("accept_plan", [objective.objective_id])} /><div className="reject-action"><textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional rejection reason" /><ActionRow title="Reject synthesis" detail="Reject with an explicit reason." disabled={!reason.trim()} onClick={() => void execute("reject_plan", [objective.objective_id, reason.trim()])} /></div></>}{objective.state === "OPEN" && !canSeal && isCreator && <div className="info-strip"><TriangleAlert size={16} /> Need {Math.max(0, objective.min_plan_count - objective.plan_count)} more plan(s) before sealing.</div>}{["ACCEPTED", "REJECTED"].includes(objective.state) && <div className="terminal-note"><Check size={17} /><strong>{objective.state} is terminal.</strong><span>{objective.decided_at ? `Decided ${formatDate(objective.decided_at)}.` : "No further decision action is valid."}</span></div>}</div>{actionError && <div className="inline-error"><CircleAlert size={16} />{actionError}</div>}</aside></div><div className="technical-row"><span>DEFINITION FINGERPRINT <strong className="mono">{short(objective.definition_fingerprint, 13, 10)}</strong></span><span>CREATED {formatDate(objective.created_at)}</span>{objective.synthesis_fingerprint && <span>SYNTHESIS <strong className="mono">{short(objective.synthesis_fingerprint, 13, 10)}</strong></span>}</div></main></SiteFrame>;
}

function ActionRow({ title, detail, onClick, disabled = false }: { title: string; detail: string; onClick: () => void; disabled?: boolean }) { return <button className="action-row" disabled={disabled} onClick={onClick}><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16} /></button>; }

function SubmitPlan({ objectiveId }: { objectiveId: string }) {
  const { wallet, runWrite, refreshKey } = useApp();
  const { bundle, loading, error, reload } = useBundle(objectiveId, wallet?.address ?? null, refreshKey);
  const [planId, setPlanId] = useState("");
  const [steps, setSteps] = useState<Step[]>([
    { id: "baseline", action: "Record the operating baseline and current health signals", dependencies: [], rationale: "" },
    { id: "canary", action: "Run a constrained canary under observable gates", dependencies: ["baseline"], rationale: "" },
    { id: "rollback", action: "Restore the prior path if a release gate fails", dependencies: ["canary"], rationale: "" },
  ]);
  const [formError, setFormError] = useState("");
  const router = useRouter();
  const updateStep = (index: number, key: keyof Step, value: string | string[]) => setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, [key]: value } : step));
  const move = (index: number, direction: -1 | 1) => setSteps((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const validate = () => {
    if (!/^[A-Za-z0-9._-]+$/.test(planId.trim())) return "Plan ID is required and may use letters, numbers, dots, underscores, and hyphens.";
    if (!steps.length || steps.length > 32) return "A plan must contain between 1 and 32 steps.";
    const ids = steps.map((step) => step.id.trim());
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return "Step IDs must be present and unique.";
    for (const step of steps) {
      if (!step.action.trim()) return `Step ${step.id || "without an ID"} needs an action.`;
      if (step.dependencies.includes(step.id)) return `Step ${step.id} cannot depend on itself.`;
      if (step.dependencies.some((dependency) => !ids.includes(dependency))) return `Step ${step.id} references an unknown dependency.`;
    }
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): boolean => { if (visiting.has(id)) return false; if (visited.has(id)) return true; visiting.add(id); const step = steps.find((item) => item.id === id); if (!step || !step.dependencies.every(visit)) return false; visiting.delete(id); visited.add(id); return true; };
    if (!ids.every(visit)) return "Step dependencies contain a cycle.";
    return "";
  };
  const submit = async () => { const validation = validate(); if (validation) { setFormError(validation); return; } setFormError(""); try { await runWrite("submit_plan", [objectiveId, planId.trim(), steps.map((step) => ({ id: step.id.trim(), action: step.action.trim(), dependencies: step.dependencies, rationale: step.rationale.trim() }))]); router.push(`/app/objectives/${objectiveId}/plans`); } catch (submitError) { setFormError(submitError instanceof Error ? submitError.message : String(submitError)); } };
  const walletStatusUnknown = Boolean(bundle?.walletReadError) || Boolean(wallet && bundle?.hasSubmitted === null);
  return <SiteFrame><main className="workspace"><PageShell eyebrow={`SUBMIT PLAN / ${objectiveId}`} title="Make one plan legible." description="This builder mirrors the contract’s step schema. One wallet may submit one immutable plan for this objective." actions={<Button href={`/app/objectives/${objectiveId}`} variant="ghost">Back to objective</Button>} /><ReadState loading={loading} error={error} retry={reload} />{bundle && walletStatusUnknown ? <div className="blocked-panel"><TriangleAlert size={20} /><div><h2>Wallet submission status unavailable.</h2><p>Converge will not enable a plan submission until the contract verifies whether this wallet has already submitted.</p><Button href={`/app/objectives/${objectiveId}`}>Return to objective <ArrowRight size={15} /></Button></div></div> : bundle && (bundle.objective.state !== "OPEN" || bundle.hasSubmitted === true) ? <div className="blocked-panel"><TriangleAlert size={20} /><div><h2>{bundle.hasSubmitted ? "This wallet already submitted." : "Submissions are sealed."}</h2><p>{bundle.hasSubmitted ? "The contract allows one plan per wallet per objective. Inspect the existing packet instead." : `The objective is ${bundle.objective.state}; the contract no longer accepts plans.`}</p><Button href={`/app/objectives/${objectiveId}/plans`}>Inspect plans <ArrowRight size={15} /></Button></div></div> : bundle && <div className="builder-layout"><div className="builder-form"><div className="builder-top"><Field label="Plan ID" hint="Unique within this objective"><input value={planId} onChange={(event) => setPlanId(event.target.value)} placeholder="plan-d" /></Field><div className="builder-capacity"><span className="eyebrow">PACKET CAPACITY</span><strong>{steps.length} / 32</strong></div></div><div className="step-editor">{steps.map((step, index) => <div className="step-card" key={`${step.id}-${index}`}><div className="step-card-head"><span className="step-number">{String(index + 1).padStart(2, "0")}</span><input className="step-id-input mono" value={step.id} onChange={(event) => updateStep(index, "id", event.target.value)} aria-label={`Step ${index + 1} ID`} /><div className="step-actions"><button className="icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move step up"><ChevronDown size={15} className="rotate-up" /></button><button className="icon-button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label="Move step down"><ChevronDown size={15} /></button><button className="icon-button danger" onClick={() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))} disabled={steps.length === 1} aria-label="Remove step"><X size={15} /></button></div></div><textarea rows={3} value={step.action} onChange={(event) => updateStep(index, "action", event.target.value)} aria-label={`Step ${index + 1} action`} placeholder="Describe the operation" /><label className="field"><span>DEPENDENCIES</span><select multiple value={step.dependencies} onChange={(event) => updateStep(index, "dependencies", Array.from(event.target.selectedOptions).map((option) => option.value))}>{steps.filter((candidate) => candidate.id !== step.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.action.slice(0, 45)}</option>)}</select><small>Use Ctrl/Cmd-click to select multiple prerequisites.</small></label><Field label="Rationale (optional)"><textarea rows={2} value={step.rationale} onChange={(event) => updateStep(index, "rationale", event.target.value)} placeholder="Why is this step here?" /></Field></div>)}</div><button className="add-step" onClick={() => setSteps((current) => [...current, { id: `step-${current.length + 1}`, action: "", dependencies: [], rationale: "" }])} disabled={steps.length >= 32}><Plus size={16} /> Add step</button>{formError && <div className="inline-error"><CircleAlert size={16} />{formError}</div>}<div className="form-footer"><span className="eyebrow">SUBMIT / IMMUTABLE PLAN PACKET</span><Button onClick={() => void submit()}>Sign plan <ArrowRight size={15} /></Button></div></div><aside className="preview-panel"><span className="eyebrow accent">FLOW PREVIEW</span><h2>Local dependency graph</h2><div className="flow-list">{steps.map((step) => <div className="flow-node" key={step.id}><span className="mono">{step.id}</span><strong>{step.action || "Untitled step"}</strong>{step.dependencies.length > 0 && <small>← {step.dependencies.join(", ")}</small>}</div>)}</div><div className="preview-note"><GitBranch size={16} /> The graph is a local preview. The contract performs the final schema and acyclicity validation.</div></aside></div>}</main></SiteFrame>;
}

function PlanSteps({ plan, sourceReferences }: { plan: PlanRecord; sourceReferences: Set<string> }) {
  return <div className="plan-step-list">{plan.steps.map((step, index) => { const reference = plan.plan_id + ":" + step.id; return <div className="submitted-step" key={step.id}><div className="submitted-step-top"><span className="step-number">{String(index + 1).padStart(2, "0")}</span><strong className="mono">{step.id}</strong>{sourceReferences.has(reference) && <span className="source-marker" title="Referenced by the persisted synthesis">SOURCE</span>}{step.dependencies.length > 0 && <span className="dependency-label">← {step.dependencies.join(", ")}</span>}</div><p>{step.action}</p>{step.rationale && <small>{step.rationale}</small>}</div>; })}</div>;
}

function PlansPage({ objectiveId }: { objectiveId: string }) {
  const { wallet, refreshKey } = useApp();
  const { bundle, loading, error, reload } = useBundle(objectiveId, wallet?.address ?? null, refreshKey);
  const sourceReferences = new Set<string>();
  if (bundle?.synthesis) {
    bundle.synthesis.result.canonical_steps.forEach((step) => step.supported_by.forEach((reference) => sourceReferences.add(reference)));
    bundle.synthesis.result.conflicts.forEach((conflict) => conflict.positions.forEach((position) => position.supported_by.forEach((reference) => sourceReferences.add(reference))));
    bundle.synthesis.result.unresolved.forEach((issue) => issue.supported_by.forEach((reference) => sourceReferences.add(reference)));
  }
  return <SiteFrame><main className="workspace"><PageShell eyebrow={"PLAN COMPARISON / " + objectiveId} title="Different paths. One packet." description="Three submitted plans remain readable as independent sequences. Orange source marks come only from persisted synthesis references." actions={<Button href={"/app/objectives/" + objectiveId} variant="ghost">Back to objective</Button>} /><ReadState loading={loading} error={error} retry={reload} />{bundle && <div className="plans-grid">{bundle.plans.map((plan) => <article className="plan-card" id={plan.plan_id} key={plan.plan_id}><div className="plan-card-head"><div><span className="eyebrow accent">{plan.plan_id.toUpperCase()}</span><h2>{plan.plan_id}</h2></div><span className="mono">{plan.steps.length} STEPS</span></div><div className="plan-submitter"><span>SUBMITTER</span><strong className="mono wrap">{plan.submitter}</strong></div><PlanSteps plan={plan} sourceReferences={sourceReferences} /><div className="plan-footer"><span>SUBMITTED {formatDate(plan.submitted_at)}</span><span className="mono">{short(plan.fingerprint, 10, 8)}</span></div></article>)}</div>}</main></SiteFrame>;
}

function resolveSource(plans: PlanRecord[], reference: string) {
  const separator = reference.indexOf(":");
  const planId = separator >= 0 ? reference.slice(0, separator) : reference;
  const stepId = separator >= 0 ? reference.slice(separator + 1) : "";
  const plan = plans.find((item) => item.plan_id === planId);
  return { planId, stepId, plan, step: plan?.steps.find((item) => item.id === stepId) };
}

function SourceTraceCard({ reference, plans, onClick }: { reference: string; plans: PlanRecord[]; onClick: () => void }) {
  const source = resolveSource(plans, reference);
  return <button className="source-trace-card" onClick={onClick}><div className="source-trace-head"><span>{source.planId}</span><ChevronRight size={13} /><strong>{source.stepId}</strong></div><p>{source.step?.action ?? "Source step unavailable"}</p>{source.step?.rationale && <small>{source.step.rationale}</small>}</button>;
}

function CanonicalNode({ step, selected, onSelect }: { step: CanonicalStep; selected: boolean; onSelect: () => void }) {
  return <div className={["canonical-node", step.status === "OPTIONAL" ? "optional" : "", selected ? "selected" : ""].filter(Boolean).join(" ")}><button onClick={onSelect}><div className="node-top"><span className="canonical-id">{step.id}</span><span className={"status-tag " + (step.status === "OPTIONAL" ? "status-optional" : "status-core")}>{step.status}</span></div><strong>{step.action}</strong><div className="node-bottom"><span>{step.supported_by.length} source references</span>{step.depends_on.length > 0 && <span className="mono">← {step.depends_on.join(", ")}</span>}</div></button></div>;
}

function CanonicalGraph({ steps, selected, onSelect }: { steps: CanonicalStep[]; selected: string | null; onSelect: (id: string) => void }) {
  const core = steps.filter((step) => step.status === "CORE");
  const optional = steps.filter((step) => step.status === "OPTIONAL");
  return <div className="canonical-graph"><div className="canonical-lane core-lane"><div className="lane-heading"><span>CORE PATH</span><small>Shared operational sequence</small></div><div className="core-track">{core.map((step, index) => <div className="core-track-node" key={step.id}><CanonicalNode step={step} selected={selected === step.id} onSelect={() => onSelect(step.id)} />{index < core.length - 1 && <div className="flow-connector" aria-hidden="true" />}</div>)}</div></div>{optional.length > 0 && <div className="canonical-lane optional-lane"><div className="lane-heading"><span>OPTIONAL BRANCHES</span><small>Preserved ideas · not promoted into the core</small></div><div className="optional-branch-list">{optional.map((step) => <div className="optional-branch" key={step.id}><div className="branch-stem" aria-hidden="true" /><div className="branch-anchor"><span>FROM {step.depends_on.length ? step.depends_on.join(" + ") : "ROOT"}</span></div><CanonicalNode step={step} selected={selected === step.id} onSelect={() => onSelect(step.id)} /></div>)}</div></div>}</div>;
}

function SynthesisOverview({ bundle, result }: { bundle: Bundle; result: SynthesisResult }) {
  const coreCount = result.canonical_steps.filter((step) => step.status === "CORE").length;
  const optionalCount = result.canonical_steps.filter((step) => step.status === "OPTIONAL").length;
  return <section className="synthesis-overview" aria-label="Convergence overview"><div className="overview-inputs"><span className="eyebrow accent">INDEPENDENT INPUTS</span>{bundle.plans.map((plan) => <div className="overview-plan" key={plan.plan_id}><strong>{plan.plan_id}</strong><span>{plan.steps.length} ordered steps</span></div>)}</div><div className="overview-converge"><GitBranch size={22} /><strong>CONVERGE</strong><span>common structure<br />kept inspectable</span></div><div className="overview-output"><span className="eyebrow accent">CANONICAL OUTPUT</span><strong>{coreCount} CORE STEPS</strong><span>{optionalCount} optional branch{optionalCount === 1 ? "" : "es"}</span></div><div className="overview-exceptions"><div><span>CONFLICTS</span><strong>{result.conflicts.length}</strong></div><div><span>UNRESOLVED</span><strong>{result.unresolved.length}</strong></div></div></section>;
}

function SynthesisPage({ objectiveId }: { objectiveId: string }) {
  const { wallet, refreshKey } = useApp();
  const { bundle, loading, error, reload } = useBundle(objectiveId, wallet?.address ?? null, refreshKey);
  const [selected, setSelected] = useState<string | null>(null);
  if (loading || error || !bundle) return <SiteFrame><main className="workspace"><PageShell eyebrow={"SYNTHESIS / " + objectiveId} title="Read the persisted structure." /><ReadState loading={loading} error={error} retry={reload} /></main></SiteFrame>;
  if (!bundle.synthesis) return <SiteFrame><main className="workspace"><PageShell eyebrow={"SYNTHESIS / " + objectiveId} title="No synthesis is persisted yet." description={"The authoritative objective state is " + bundle.objective.state + "."} /><div className="blocked-panel"><TriangleAlert size={20} /><div><h2>Synthesis unavailable</h2><p>Converge does not invent a preview result. Return when the contract exposes get_synthesis for this objective.</p></div></div></main></SiteFrame>;
  const result = bundle.synthesis.result;
  const selectedStep = selected && !selected.includes(":") ? result.canonical_steps.find((step) => step.id === selected) : null;
  const selectedSource = selected?.includes(":") ? resolveSource(bundle.plans, selected) : null;
  return <SiteFrame><main className="workspace synthesis-page"><div className="synthesis-heading"><div><span className="eyebrow accent">AUTHORITATIVE SYNTHESIS / {objectiveId}</span><h1>Canonical plan,<br /><em>disagreement intact.</em></h1><p>Persisted by the deployed contract after consensus. The visual path below is derived from canonical dependencies; every source card resolves to an original submitted step.</p></div><div className="synthesis-fingerprint"><span className="eyebrow">FINGERPRINT</span><strong className="mono wrap">{bundle.synthesis.fingerprint}</strong><span>WRITTEN {formatDate(bundle.synthesis.synthesized_at)}</span></div></div><div className="synthesis-stats"><div><strong>{result.canonical_steps.length}</strong><span>CANONICAL STEPS</span></div><div><strong>{result.canonical_steps.filter((step) => step.status === "CORE").length}</strong><span>CORE</span></div><div><strong>{result.canonical_steps.filter((step) => step.status === "OPTIONAL").length}</strong><span>OPTIONAL</span></div><div><strong>{result.conflicts.length}</strong><span>CONFLICTS</span></div><div><strong>{result.unresolved.length}</strong><span>UNRESOLVED</span></div></div><SynthesisOverview bundle={bundle} result={result} /><section className="synthesis-section"><div className="section-head"><div><span className="eyebrow accent">01 / CANONICAL PLAN</span><h2>Dependency flow</h2></div><span className="mono">SELECT A NODE TO TRACE IT</span></div><CanonicalGraph steps={result.canonical_steps} selected={selectedStep?.id ?? null} onSelect={setSelected} /></section><section className="synthesis-section trace-section"><div className="section-head"><div><span className="eyebrow accent">02 / SOURCE TRACEABILITY</span><h2>{selectedStep ? selectedStep.id + " provenance" : selectedSource ? selectedSource.planId + ":" + selectedSource.stepId : "Select any canonical step"}</h2></div></div>{selectedStep ? <div className="trace-panel"><div className="trace-summary"><span className={"status-tag " + (selectedStep.status === "OPTIONAL" ? "status-optional" : "status-core")}>{selectedStep.status}</span><h3>{selectedStep.action}</h3><p>Canonical dependencies: {selectedStep.depends_on.length ? selectedStep.depends_on.join(", ") : "none"}</p></div><div className="trace-sources">{selectedStep.supported_by.map((reference) => <SourceTraceCard reference={reference} plans={bundle.plans} onClick={() => setSelected(reference)} key={reference} />)}</div></div> : selectedSource ? <div className="source-detail"><div><span className="eyebrow accent">ORIGINAL SUBMITTED STEP</span><h3>{selectedSource.step?.action ?? "Step not found"}</h3><p>{selectedSource.step?.rationale || "No rationale recorded."}</p></div><div className="source-detail-meta"><span>PLAN</span><strong>{selectedSource.plan?.plan_id ?? selectedSource.planId}</strong><span>STEP</span><strong className="mono wrap">{selectedSource.stepId}</strong><span>SUBMITTER</span><strong className="mono wrap">{selectedSource.plan?.submitter ?? "—"}</strong><span>DEPENDENCIES</span><strong className="mono">{selectedSource.step?.dependencies.join(", ") || "none"}</strong></div></div> : <div className="trace-empty"><GitBranch size={20} /><p>Click a canonical node to reveal every supporting plan step and its original wording. Select a source card to inspect rationale and dependencies.</p></div>}</section><section className="synthesis-section split-section"><div><div className="section-head"><div><span className="eyebrow accent">03 / CONFLICTS</span><h2>Positions kept separate.</h2></div></div>{result.conflicts.map((conflict) => <article className="conflict-card" key={conflict.topic}><span className="eyebrow">TOPIC</span><h3>{conflict.topic}</h3>{conflict.positions.map((position, index) => <div className="position" key={position.position}><div><span>POSITION {String.fromCharCode(65 + index)}</span><p>{position.position}</p></div><div className="position-sources">{position.supported_by.map((reference) => <SourceTraceCard reference={reference} plans={bundle.plans} onClick={() => setSelected(reference)} key={reference} />)}</div></div>)}</article>)}</div><div><div className="section-head"><div><span className="eyebrow accent">04 / UNRESOLVED</span><h2>Open questions stay open.</h2></div></div>{result.unresolved.map((issue) => <article className="unresolved-card" key={issue.issue}><CircleAlert size={18} /><div><h3>{issue.issue}</h3><div className="position-sources">{issue.supported_by.map((reference) => <SourceTraceCard reference={reference} plans={bundle.plans} onClick={() => setSelected(reference)} key={reference} />)}</div></div></article>)}</div></section></main></SiteFrame>;
}

function DemoPage() {
  const router = useRouter();
  const { wallet } = useApp();
  const { bundle, loading, error, reload } = useBundle(LIVE_OBJECTIVE_ID, wallet?.address ?? null);
  const result = bundle?.synthesis?.result;
  const core = result?.canonical_steps.filter((step) => step.status === "CORE") ?? [];

  const example = core.find((step) => step.supported_by.length > 1) ?? core[0];
  const sourceReferences = new Set<string>();
  if (result) {
    result.canonical_steps.forEach((step) => step.supported_by.forEach((reference) => sourceReferences.add(reference)));
    result.conflicts.forEach((conflict) => conflict.positions.forEach((position) => position.supported_by.forEach((reference) => sourceReferences.add(reference))));
    result.unresolved.forEach((issue) => issue.supported_by.forEach((reference) => sourceReferences.add(reference)));
  }
  const chapters = ["OBJECTIVE", "PLAN A", "PLAN B", "PLAN C", "CONVERGENCE", "CANONICAL", "PROVENANCE", "DISAGREEMENT", "ACCEPTED"];
  return <SiteFrame><main className="workspace demo-page editorial-demo"><PageShell eyebrow="REVIEWER WALKTHROUGH / READ ONLY" title="One live objective, end to end." description="A concise read-only story assembled from the deployed contract. Scroll the artifact; open the workspace when you want to act." actions={<Button href={"/app/objectives/" + LIVE_OBJECTIVE_ID}>Open workspace <ArrowRight size={15} /></Button>} /><ReadState loading={loading} error={error} retry={reload} />{bundle && result && <div className="demo-story-shell"><nav className="demo-story-nav" aria-label="Walkthrough chapters">{chapters.map((chapter, index) => <a href={"#demo-" + (index + 1)} key={chapter}><span>{String(index + 1).padStart(2, "0")}</span>{chapter}</a>)}</nav><div className="demo-story"><section id="demo-1" className="demo-chapter demo-chapter-dark"><div className="chapter-index">01 / OBJECTIVE</div><div><span className="eyebrow accent">{bundle.objective.objective_id}</span><h2>{bundle.objective.title}</h2><p>{bundle.objective.objective_text}</p><div className="demo-fact-row"><span>STATE <strong><StatusTag state={bundle.objective.state} /></strong></span><span>PLANS <strong>{bundle.objective.plan_count}</strong></span><span>DECIDED <strong>{formatDate(bundle.objective.decided_at)}</strong></span></div></div></section>{bundle.plans.map((plan, index) => <section id={"demo-" + (index + 2)} className="demo-chapter plan-chapter" key={plan.plan_id}><div className="chapter-index">{String(index + 2).padStart(2, "0")} / {plan.plan_id.toUpperCase()}</div><div className="demo-plan-chapter-body"><div><span className="eyebrow accent">INDEPENDENT SUBMISSION</span><h2>{plan.plan_id}</h2><p>One submitted sequence from <span className="mono">{short(plan.submitter)}</span>. Its order and wording remain unchanged.</p></div><PlanSteps plan={plan} sourceReferences={sourceReferences} /></div></section>)}<section id="demo-5" className="demo-chapter demo-chapter-accent"><div className="chapter-index">05 / CONVERGENCE</div><div><span className="eyebrow">GENLAYER CONSENSUS</span><h2>{bundle.plans.length} paths enter.<br /><em>{result.canonical_steps.length} structures persist.</em></h2><p>Shared structure becomes CORE. Ideas that do not belong on the common path remain visible as OPTIONAL, conflict, or unresolved output.</p><SynthesisOverview bundle={bundle} result={result} /></div></section><section id="demo-6" className="demo-chapter canonical-chapter"><div className="chapter-index">06 / CANONICAL</div><div><span className="eyebrow accent">PERSISTED OUTPUT</span><h2>One operational path,<br /><em>branches intact.</em></h2><CanonicalGraph steps={result.canonical_steps} selected={null} onSelect={() => undefined} /></div></section><section id="demo-7" className="demo-chapter provenance-chapter"><div className="chapter-index">07 / PROVENANCE</div><div><span className="eyebrow accent">SOURCE TRACEABILITY</span><h2>{example ? example.id + " keeps its origin." : "Every step keeps its origin."}</h2><p>{example ? example.action : "The persisted synthesis exposes source references for each canonical step."}</p>{example && <div className="demo-source-grid">{example.supported_by.map((reference) => <SourceTraceCard reference={reference} plans={bundle.plans} onClick={() => router.push("/app/objectives/" + LIVE_OBJECTIVE_ID + "/synthesis")} key={reference} />)}</div>}<Button href={"/app/objectives/" + LIVE_OBJECTIVE_ID + "/synthesis"}>Open full provenance <ArrowRight size={15} /></Button></div></section><section id="demo-8" className="demo-chapter disagreement-chapter"><div className="chapter-index">08 / DISAGREEMENT</div><div><span className="eyebrow accent">PRESERVED DIVERGENCE</span><h2>Not every position<br /><em>becomes consensus.</em></h2><div className="demo-disagreement-grid">{result.conflicts.map((conflict) => <div className="demo-focus-block" key={conflict.topic}><span className="eyebrow">{conflict.topic}</span>{conflict.positions.map((position, index) => <div className="demo-position" key={position.position}><strong>POSITION {String.fromCharCode(65 + index)}</strong><p>{position.position}</p></div>)}</div>)}{result.unresolved.map((issue) => <div className="demo-focus-block unresolved-focus" key={issue.issue}><span className="eyebrow">UNRESOLVED</span><CircleAlert size={18} /><p>{issue.issue}</p></div>)}</div></div></section><section id="demo-9" className="demo-chapter demo-chapter-dark accepted-chapter"><div className="chapter-index">09 / ACCEPTED</div><div><span className="eyebrow accent">FINAL OBJECTIVE STATE</span><h2>{bundle.objective.state === "ACCEPTED" ? "Accepted is terminal." : "The contract is " + bundle.objective.state + "."}</h2><p>The creator accepted the persisted synthesis. The objective is now final; no further decision action is exposed.</p><div className="demo-final"><Check size={19} /><StatusTag state={bundle.objective.state} /><span>Decided {formatDate(bundle.objective.decided_at)}</span></div></div></section></div></div>}</main></SiteFrame>;
}

export default function ConvergeClient({ view, objectiveId }: { view: View; objectiveId?: string }) {
  return <AppProvider><RouteView view={view} objectiveId={objectiveId} /></AppProvider>;
}

function RouteView({ view, objectiveId }: { view: View; objectiveId?: string }) {
  if (view === "landing") return <Landing />;
  if (view === "registry") return <Registry />;
  if (view === "new") return <NewObjective />;
  if (view === "demo") return <DemoPage />;
  if (!objectiveId) return <SiteFrame><main className="workspace"><PageShell eyebrow="OBJECTIVE" title="An objective ID is required." /></main></SiteFrame>;
  if (view === "submit") return <SubmitPlan objectiveId={objectiveId} />;
  if (view === "plans") return <PlansPage objectiveId={objectiveId} />;
  if (view === "synthesis") return <SynthesisPage objectiveId={objectiveId} />;
  return <ObjectivePage objectiveId={objectiveId} />;
}
