import { useEffect, useRef, useState } from "react";
import { callAction, useActionMutation } from "@agent-native/core/client/hooks";
import { toast } from "sonner";
import { AGENT_CAPABILITIES, type AgentPermissions, type DecisionView, type PurchasePlan } from "../../shared/types";
import { dateLabel, money } from "../../shared/format";

const permissionLabels = { extractFacts: "Extract source-linked facts", addQuotes: "Add supplier quotes", draftPlans: "Prepare checked plans", changeRequirements: "Change my requirements" };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Refresh the workspace and try again.";

export function BuyingControls({ view, ask, refresh, blocked, onBusyChange }: { view: DecisionView; ask: (message: string) => void; refresh: () => Promise<unknown>; blocked: boolean; onBusyChange: (value: boolean) => void }) {
  const prepare = useActionMutation("prepare-purchase-plan");
  const approve = useActionMutation("approve-purchase-plan");
  const permissions = useActionMutation("set-agent-permissions");
  const [saving, setBusy] = useState(false);
  const busy = saving || blocked;
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [speech, setSpeech] = useState<{ url: string; text: string; version: number } | null>(null);
  const reviewRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const plan = view.state.purchasePlan;
  const req = view.state.requirements;
  const eligible = view.recommendation.assessments.filter(item => item.eligible);
  const chosen = eligible.find(item => item.id === supplierId)?.id ?? view.recommendation.winner?.id ?? "";
  const quote = plan && view.state.quotes.find(item => item.id === plan.quoteId);
  useEffect(() => { setConfirmed(false); }, [plan?.fingerprint, plan?.status]);
  useEffect(() => { setSupplierId(""); setReview(false); setSpeech(null); }, [view.id]);
  useEffect(() => { if (review) reviewRef.current?.showModal(); else reviewRef.current?.close(); }, [review]);
  useEffect(() => () => { if (speech) URL.revokeObjectURL(speech.url); }, [speech]);

  async function perform(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    onBusyChange(true);
    try { await work(); await refresh(); toast.success(message); }
    catch (error) { toast.error(errorText(error)); await refresh().catch(() => {}); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function setAllowed(allowed: AgentPermissions["allowed"]) {
    await perform(() => permissions.mutateAsync({ id: view.id, expectedVersion: view.version, allowed }), "Agent permissions saved");
  }
  async function downloadPacket() {
    await perform(async () => {
      const result = await callAction<{ brief: string; plan: PurchasePlan; evidence: unknown }>("export-purchase-plan", { id: view.id }, { method: "GET" });
      const blob = new Blob([result.brief + "\n\nOriginal quotes, corrections and checks:\n" + JSON.stringify({ plan: result.plan, evidence: result.evidence }, null, 2)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "shortlist-purchase-packet.txt"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Downloaded the approved purchase packet");
  }
  async function listen() {
    setBusy(true);
    try {
      const result = await callAction<{ audioBase64: string; text: string; version: number }>("speak-decision", { id: view.id });
      const bytes = Uint8Array.from(atob(result.audioBase64), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      setSpeech({ url, text: result.text, version: result.version });
      // The player remains available when a browser requires a separate play tap.
      setTimeout(() => { void audioRef.current?.play().catch(() => {}); }, 0);
    } catch (error) { toast.error(errorText(error)); }
    finally { setBusy(false); }
  }

  return <div className="sl-buying-controls">
    <section className="sl-workable" aria-labelledby="sl-workable-title">
      <div className="sl-section-top"><div><p className="sl-eyebrow">YOUR NEXT MOVE</p><h2 id="sl-workable-title">Find a workable option</h2></div><button className="sl-text-button" onClick={() => ask("Use inspect-options for my current decision. Explain the exact changes or missing facts that would make each quote workable, and help me refine the supplier question drafts. Keep my requirements and locked corrections as they are.")}>✦ Work through the options</button></div>
      <div className="sl-options">{view.options.length ? view.options.map(option => <article className="sl-option" key={option.quoteId}>
        <div className="sl-option-heading"><h3>{option.supplier}</h3><span className={option.eligible ? "sl-fit" : "sl-unfit"}>{option.eligible ? "Fits your brief" : "Changes needed"}</span></div>
        <ul>{option.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        {Boolean(option.extraBudgetMinor) && option.maximumUnitMinor !== null && <p className="sl-price-target">Unit price target: <strong>{money(option.maximumUnitMinor, req.currency)}</strong> with stated shipping and tax unchanged.</p>}
        <details><summary>Supplier question draft</summary><textarea aria-label={"Question draft for " + option.supplier} readOnly value={option.questions} rows={8} /><button className="sl-button" onClick={() => { void navigator.clipboard.writeText(option.questions).then(() => toast.success("Question draft copied"), () => toast.error("Select and copy the question draft.")); }}>Copy question draft</button></details>
      </article>) : <p className="sl-fine">Add and review a quote to see the next steps.</p>}</div>
    </section>
    <section className="sl-plan" aria-labelledby="sl-plan-title">
      <div className="sl-section-top"><div><p className="sl-eyebrow">FROM COMPARISON TO A DECISION</p><h2 id="sl-plan-title">Your purchase plan</h2></div><button className="sl-text-button" disabled={busy} onClick={() => void listen()}>{busy ? "Working…" : "♫ Hear the decision"}</button></div>
      <div className="sl-plan-body">
        {plan ? <><div className="sl-plan-status"><span className={plan.status === "outdated" ? "sl-unfit" : "sl-fit"}>{plan.status === "approved" ? "✓ Approved by you" : plan.status === "outdated" ? "A fresh review is needed" : "✓ Independently checked · ready for review"}</span><small>Prepared at v{plan.preparedVersion}</small></div><h3>{plan.supplier} · {money(plan.totalMinor, plan.currency)}</h3><p>{plan.quantity} units · delivery {dateLabel(plan.deliveryDate)}</p>{plan.status === "outdated" && <p className="sl-outdated" role="status">A quote, requirement or permission changed. Prepare a fresh plan before approving or downloading.</p>}<div className="sl-plan-actions">{plan.status === "ready" && <button className="sl-button primary" disabled={busy} onClick={() => setReview(true)}>Review purchase plan</button>}{plan.status === "approved" && <><button className="sl-button primary" disabled={busy} onClick={() => void downloadPacket()}>↓ Download purchase packet</button><button className="sl-button" onClick={() => setReview(true)}>View approved plan</button></>}</div></> : <p>Choose an offer that meets your requirements. Shortlist checks the complete cost, quantity, currency, delivery, source excerpts and supplier terms before your review.</p>}
        <div className="sl-prepare"><label>Supplier for the plan<select aria-label="Plan supplier" value={chosen} disabled={!eligible.length || busy} onChange={event => setSupplierId(event.target.value)}>{!eligible.length && <option value="">Review the workable options first</option>}{eligible.map(item => <option key={item.id} value={item.id}>{item.supplier} · {money(item.totalMinor, req.currency)}</option>)}</select></label><button className="sl-button" disabled={busy || !chosen} onClick={() => void perform(() => prepare.mutateAsync({ id: view.id, expectedVersion: view.version, quoteId: chosen }), "Purchase plan checked and prepared")}>Prepare purchase plan</button></div>
        {speech && <div className="sl-speech"><p className="sl-fine">Vultr voice · decision at v{speech.version}{speech.version !== view.version ? " · workspace has since changed" : ""}</p><audio ref={audioRef} controls src={speech.url} aria-label="Spoken decision explanation" /><details><summary>Read the spoken explanation</summary><p>{speech.text}</p></details></div>}
      </div>
    </section>
    <details className="sl-permissions"><summary>What the agent may change <span>· permission v{view.permissions.version}</span></summary><p>You choose the agent's write permissions. Reading and comparing quotes remain available.</p><div className="sl-permission-options">{AGENT_CAPABILITIES.map(key => <label key={key}><input type="checkbox" checked={view.permissions.allowed[key]} disabled={busy} onChange={event => void setAllowed({ ...view.permissions.allowed, [key]: event.target.checked })} />{permissionLabels[key]}</label>)}</div><button className="sl-button" disabled={busy || !Object.values(view.permissions.allowed).some(Boolean)} onClick={() => void setAllowed({ extractFacts: false, addQuotes: false, draftPlans: false, changeRequirements: false })}>Revoke agent writes</button></details>
    {review && plan && quote && <dialog ref={reviewRef} className="sl-modal sl-plan-review" aria-labelledby="sl-review-title" onCancel={() => setReview(false)}><div className="sl-modal-top"><h2 id="sl-review-title">Review your purchase plan</h2><button className="sl-icon" aria-label="Close plan review" onClick={() => setReview(false)}>×</button></div><dl className="sl-plan-amounts"><div><dt>Supplier</dt><dd>{plan.supplier}</dd></div><div><dt>Quantity</dt><dd>{plan.quantity} units</dd></div><div><dt>Unit price</dt><dd>{money(plan.unitMinor, plan.currency)}</dd></div><div><dt>Shipping</dt><dd>{money(plan.shippingMinor, plan.currency)}</dd></div><div><dt>Stated tax</dt><dd>{money(plan.taxMinor, plan.currency)}</dd></div><div className="sl-total"><dt>Complete total</dt><dd>{money(plan.totalMinor, plan.currency)}</dd></div><div><dt>Your budget</dt><dd>{money(req.budgetMinor, req.currency)}</dd></div><div><dt>Delivery</dt><dd>{dateLabel(plan.deliveryDate)}</dd></div><div><dt>Required by</dt><dd>{dateLabel(req.deliveryBy)}</dd></div></dl><p className="sl-review-terms"><strong>Supplier exclusions</strong><br />{quote.exclusions.map(item => item.text).join("; ") || "None stated in the reviewed quote."}</p><details className="sl-review-checks"><summary>Independent checks · {plan.verification.checks.filter(check => check.ok).length}/{plan.verification.checks.length} passed</summary><ul>{plan.verification.checks.map(check => <li key={check.id}>{check.ok ? "✓" : "!"} {check.label}</li>)}</ul></details>{plan.status === "ready" ? <><label className="sl-checkbox sl-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed this supplier, complete cost, delivery and exclusions.</label><button className="sl-button primary" disabled={busy || !confirmed} onClick={() => void perform(async () => { await approve.mutateAsync({ id: view.id, expectedVersion: view.version, fingerprint: plan.fingerprint, confirmed: true }); setReview(false); }, "Approved the exact reviewed purchase plan")}>Approve this exact plan</button></> : <p className="sl-fine">{plan.status === "approved" ? "You approved this reviewed plan. Its packet includes the original quotes, checks and corrections." : "This plan changed and needs to be prepared again."}</p>}</dialog>}
  </div>;
}
