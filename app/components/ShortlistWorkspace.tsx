import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { callAction, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";
import { toast } from "sonner";
import { FIELD_KEYS, type DecisionView, type Evidence, type FieldKey, type FieldValue, type Quote } from "../../shared/types";
import { dateLabel, FIELD_LABELS, money, moneyInput } from "../../shared/format";
import { TAB_ID } from "../lib/tab-id";
import { BuyingControls } from "./BuyingControls";
import { VoiceBrief } from "./VoiceBrief";

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="sl-modal" aria-labelledby="sl-modal-title" onCancel={close}>
    <div className="sl-modal-top"><h2 id="sl-modal-title">{title}</h2><button className="sl-icon" aria-label="Close dialog" onClick={close}>×</button></div>{children}
  </dialog>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "The action could not be completed. Refresh and try again.";

export function ShortlistWorkspace() {
  const [params, setParams] = useSearchParams();
  const decisions = useActionQuery("list-decisions", {});
  const id = params.get("decision") ?? "";
  const query = useActionQuery("get-decision", { id }, { enabled: Boolean(id) });
  const view = query.data as DecisionView | undefined;
  const [dialog, setDialog] = useState<"create" | "quote" | "source" | "ai" | null>(null);
  const [edit, setEdit] = useState<{ quote: Quote; field: FieldKey } | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [saving, setBusy] = useState(false);
  const [buyingBusy, setBuyingBusy] = useState(false);
  const busy = saving || buyingBusy;
  const [aiMessage, setAiMessage] = useState("");
  const [sendingToAgent, setSendingToAgent] = useState(false);
  const create = useActionMutation("create-decision");
  const update = useActionMutation("update-requirements");
  const correct = useActionMutation("correct-quote");
  const addQuote = useActionMutation("add-quote");
  const source = useActionMutation("replace-quote-source");
  const undo = useActionMutation("undo-decision");
  const selected = view?.state.quotes.find(q => q.id === params.get("quote")) ?? view?.state.quotes[0];
  useEffect(() => {
    if (!id && decisions.data?.[0]) setParams({ decision: decisions.data[0].id }, { replace: true });
  }, [id, decisions.data, setParams]);
  useEffect(() => { setEvidence(null); }, [selected?.id, selected?.sourceHash]);

  async function perform(action: () => Promise<unknown>, success: string, close = true) {
    setBusy(true);
    try { await action(); if (id) await query.refetch(); toast.success(success); if (close) { setDialog(null); setEdit(null); } }
    catch (error) { toast.error(errorText(error)); if (id) await query.refetch().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function createWorkspace(example: boolean, title = "Workshop welcome kits") {
    setBusy(true);
    try {
      const result = await create.mutateAsync({ title, example });
      setParams({ decision: result.id }); setDialog(null);
    } catch (error) { toast.error(errorText(error)); }
    finally { setBusy(false); }
  }
  function selectQuote(quote: Quote) {
    setParams({ decision: id, quote: quote.id });
  }
  function ask(message: string) {
    setAiMessage(message); setDialog("ai");
  }
  async function continueWithAgent() {
    if (sendingToAgent) return;
    setSendingToAgent(true);
    setDialog(null);
    try {
      const result = await sendToAgentChatAndConfirm({ message: aiMessage, context: "Current Shortlist decision ID: " + id + "; selected quote ID: " + (selected?.id ?? "none") + ". Preserve all manual locks. Read the current permission version before making a change.", chatTarget: "local", openSidebar: true, tabId: TAB_ID });
      if (!result.delivered) {
        toast.error("The buying agent did not receive this request. Open the agent and try again.");
        setDialog("ai");
      }
    } catch {
      toast.error("The buying agent could not be opened. Please try again.");
      setDialog("ai");
    } finally { setSendingToAgent(false); }
  }
  async function exportBrief() {
    await perform(async () => {
      const result = await callAction<{ brief: string; evidence: unknown; sha256: string }>("export-decision", { id }, { method: "GET" });
      const blob = new Blob([result.brief + "\n\nEvidence bundle:\n" + JSON.stringify({ sha256: result.sha256, state: result.evidence }, null, 2)], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "shortlist-decision.txt"; link.click(); URL.revokeObjectURL(url);
    }, "Exported the current decision and evidence", false);
  }
  const req = view?.state.requirements;
  const winner = view?.recommendation.winner;
  const last = view?.events[0];
  const isLoading = decisions.isLoading || (id && query.isLoading);
  return <AgentSidebar defaultOpen={false} browserTabId={TAB_ID} showModelSelector={false} composerPlaceholder="Ask about this buying decision…" emptyStateText="Compare offers, inspect a source or rethink your requirements." defaultSidebarWidth={390}>
    <div className="shortlist-app">
      <header className="sl-header"><Link to="/home" className="sl-brand"><span className="sl-mark">S<span>↗</span></span>Shortlist</Link>
        <span className="sl-header-note">A clearer buying decision</span>
        <div className="sl-header-links"><Link to="/settings">Settings</Link><a href="https://github.com/NSEVEjk0/shortlist-agent-native" target="_blank" rel="noreferrer">Source ↗</a></div>
      </header>
      <div className="sl-layout">
        <aside className="sl-nav"><p className="sl-eyebrow">YOUR DECISIONS</p>
          {decisions.data?.map((item: { id: string; title: string }) => <button key={item.id} className={"sl-nav-item " + (id === item.id ? "active" : "")} onClick={() => setParams({ decision: item.id })}><span>▤</span>{item.title}</button>)}
          <button className="sl-nav-new" onClick={() => setDialog("create")}>＋ New decision</button>
          <div className="sl-nav-bottom"><span className="sl-status-dot" />Private to your account<p>Facts, decisions and their sources stay together.</p></div>
        </aside>
        <main className="sl-main">
          {isLoading ? <div className="sl-skeleton" aria-label="Loading your workspace"><div /><div /><div /></div> : query.error || decisions.error ? <div className="sl-empty" role="alert"><h1>Your workspace could not be loaded.</h1><p>{errorText(query.error ?? decisions.error)}</p><button className="sl-button primary" onClick={() => { void decisions.refetch(); void query.refetch(); }}>Try again</button></div> : !view ? <div className="sl-empty">
            <p className="sl-eyebrow">THE RIGHT QUOTE. ALL THE CONTEXT.</p><h1>Choose with confidence.<br />Keep the reasoning.</h1>
            <p>Compare supplier quotes, catch hidden costs and keep your corrections in control while the agent helps.</p>
            <div className="sl-empty-actions"><button className="sl-button primary" disabled={busy} onClick={() => void createWorkspace(true)}>{busy ? "Creating…" : "Try the example"} <span>↗</span></button><button className="sl-button" onClick={() => setDialog("create")}>Bring your own quotes</button></div>
            <p className="sl-fine">The example uses three fictional supplier quotes. Changes are saved to your private workspace.</p>
            <div className="sl-benefits"><div><strong>See every source</strong><p>Trace a price or date to its exact quote.</p></div><div><strong>Make a correction stick</strong><p>Lock a fact the agent must preserve.</p></div><div><strong>Rethink without restarting</strong><p>Change the budget. See the decision update.</p></div></div>
          </div> : <>
            <div className="sl-title-row"><div><p className="sl-eyebrow">BUYING WORKSPACE</p><h1>{view.state.title}</h1></div><div className="sl-actions"><VoiceBrief view={view} blocked={busy} refresh={() => query.refetch()} /><button className="sl-button" disabled={busy} onClick={() => void exportBrief()}>↓ Export brief</button><button className="sl-button primary" onClick={() => ask("Compare my current supplier quotes against my requirements. Explain the recommendation, exclusions and any unknown facts. Preserve all manual locks.")}>✦ Ask the agent</button></div></div>
            {req && <form key={view.version} className="sl-requirements" onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              void perform(async () => update.mutateAsync({ id, expectedVersion: view.version, patch: { budgetMinor: moneyInput(String(data.get("budget"))), quantity: Number(data.get("quantity")), currency: String(data.get("currency")) as "USD" | "EUR" | "GBP", deliveryBy: String(data.get("deadline")) } }), "Requirements saved; recommendation recalculated", false);
            }}><label>Total budget<div className="sl-input-combo"><select name="currency" aria-label="Budget currency" defaultValue={req.currency}><option>USD</option><option>EUR</option><option>GBP</option></select><input name="budget" aria-label="Total budget" defaultValue={(req.budgetMinor / 100).toFixed(2)} inputMode="decimal" required /></div></label><label>Quantity<input name="quantity" type="number" aria-label="Required quantity" min={1} max={100000} defaultValue={req.quantity} required /></label><label>Arrive by<input name="deadline" type="date" aria-label="Delivery deadline" defaultValue={req.deliveryBy} required /></label><button className="sl-button" disabled={busy} type="submit">{busy ? "Saving…" : "Update decision"}</button></form>}
            <section className={"sl-recommendation " + (winner ? "" : "unresolved")} aria-live="polite">
              <div className="sl-rec-icon">{winner ? "✓" : "!"}</div><div><p className="sl-eyebrow">{winner ? "YOUR CURRENT SHORTLIST" : "REQUIREMENTS NOT MET"}</p><h2 data-testid="recommendation">{winner ? winner.supplier : "No suitable offer"}</h2><p>{winner ? money(winner.totalMinor, req?.currency) + " total · arrives " + dateLabel(winner.deliveryDate) + " · meets all confirmed requirements" : "Keep the requirements or adjust them. Unconfirmed facts and unsuitable offers are shown below."}</p></div><span className="sl-version">Saved · v{view.version}</span>
            </section>
            {last && <div className="sl-change" aria-live="polite"><span>↳</span><p>{last.summary}{last.previousWinner !== last.nextWinner && <strong> · {last.previousWinner ?? "No suitable offer"} → {last.nextWinner ?? "No suitable offer"}</strong>}</p><button disabled={busy || last.kind === "undo"} onClick={() => void perform(() => undo.mutateAsync({ id, expectedVersion: view.version }), "Restored the previous decision", false)}>Undo</button></div>}
            <div className="sl-work-columns">
              <section className="sl-comparison"><div className="sl-section-top"><h2>Supplier comparison</h2><button className="sl-text-button" onClick={() => setDialog("quote")}>＋ Add quote</button></div>
                {!view.state.quotes.length ? <div className="sl-panel-empty"><p>Start with an original supplier quote.</p><button className="sl-button" onClick={() => setDialog("quote")}>Paste a quote</button></div> : <div className="sl-table-wrap"><table><thead><tr><th>Supplier</th><th>Total cost</th><th>Delivery</th><th>Fit</th></tr></thead><tbody>{view.state.quotes.map(quote => {
                  const assessment = view.recommendation.assessments.find(item => item.id === quote.id);
                  return <tr key={quote.id} className={selected?.id === quote.id ? "selected" : ""}><td><button className="sl-supplier" onClick={() => selectQuote(quote)} aria-label={"View " + quote.supplier}><span className="sl-avatar">{quote.supplier.charAt(0)}</span><span>{quote.supplier}{winner?.id === quote.id && <small>Recommended</small>}</span></button></td><td>{quote.fields.currency.value === null ? "Confirm currency" : money(assessment?.totalMinor ?? null, String(quote.fields.currency.value))}</td><td>{dateLabel(assessment?.deliveryDate ?? null)}{quote.fields.deliveryDate.locked && <span title="Your locked correction" aria-label="Delivery date locked"> ▣</span>}</td><td>{assessment?.eligible ? <span className="sl-fit">Meets requirements</span> : <span className="sl-unfit">{assessment?.reasons[0]}</span>}</td></tr>;
                })}</tbody></table></div>}
                {selected && <div className="sl-facts"><div className="sl-section-top"><h3>{selected.supplier} · confirmed facts</h3><button className="sl-text-button" onClick={() => ask("Read and extract the current original quote for supplier " + selected.id + " in decision " + id + ". Use exact source citations and preserve human-locked fields. Leave ambiguous amounts or dates unknown.")}>✦ Review with agent</button></div>
                  {FIELD_KEYS.map(field => { const fact = selected.fields[field]; const amount = ["unitMinor", "shippingMinor", "taxMinor"].includes(field);
                    const display = amount ? money(typeof fact.value === "number" ? fact.value : null, String(selected.fields.currency.value ?? req?.currency ?? "USD")) : field === "deliveryDate" ? dateLabel(typeof fact.value === "string" ? fact.value : null) : fact.value ?? "Not confirmed";
                    return <div className="sl-fact-row" key={field}><span>{FIELD_LABELS[field]}</span><button className="sl-fact-value" onClick={() => setEvidence(fact.evidence)} disabled={!fact.evidence}>{display}{fact.locked && <span className="sl-lock" title={fact.note ?? "Locked manual correction"}>▣ Locked</span>}</button><span className="sl-origin">{fact.origin === "source" ? "Source linked" : fact.origin === "manual" ? "Your correction" : "Needs review"}</span><button className="sl-text-button" aria-label={"Edit " + selected.supplier + " " + FIELD_LABELS[field]} onClick={() => setEdit({ quote: selected, field })}>Edit</button></div>;
                  })}
                  {selected.exclusions.length > 0 && <div className="sl-exclusions"><strong>Supplier exclusions</strong>{selected.exclusions.map((item, index) => <button key={index} onClick={() => setEvidence(item.evidence)}>{item.text} ↗</button>)}</div>}
                </div>}
              </section>
              <section className="sl-source"><div className="sl-section-top"><h2>Original quote</h2>{selected && <button className="sl-text-button" onClick={() => setDialog("source")}>Replace source</button>}</div>{selected ? <><div className="sl-document-top"><span>↳ {selected.supplier}</span><small>Original text</small></div><pre>{evidence ? <>{selected.source.slice(0, evidence.start)}<mark>{selected.source.slice(evidence.start, evidence.end)}</mark>{selected.source.slice(evidence.end)}</> : selected.source}</pre><div className="sl-source-foot"><span>✓ Exact source preserved</span><p>Select a source-linked fact to highlight its evidence. Your corrections keep their own reason.</p></div></> : <div className="sl-panel-empty">Select a supplier to inspect its quote.</div>}</section>
            </div>
            <BuyingControls view={view} ask={ask} blocked={busy} onBusyChange={setBuyingBusy} refresh={() => query.refetch()} />
            <details className="sl-history"><summary>Decision trail · {view.events.length} recent changes</summary>{view.events.map(event => <div key={event.id}><time>{new Date(event.createdAt).toLocaleString()}</time><span>{event.actor === "agent" ? "Agent" : "You"}</span><p>{event.summary}</p><small>v{event.version}</small></div>)}</details>
          </>}
          <footer className="sl-footer"><span>Shortlist · source-linked buying decisions</span><span>Built with Agent-Native</span></footer>
        </main>
      </div>
      {dialog === "create" && <Modal title="Start a buying decision" close={() => setDialog(null)}><form onSubmit={event => { event.preventDefault(); void createWorkspace(false, String(new FormData(event.currentTarget).get("title"))); }}><label>Decision name<input name="title" placeholder="e.g. Team workshop kits" required maxLength={160} autoFocus /></label><button className="sl-button primary" disabled={busy}>Create workspace</button><button type="button" className="sl-button" disabled={busy} onClick={() => void createWorkspace(true)}>Use the fictional example</button></form></Modal>}
      {dialog === "quote" && view && <Modal title="Add a supplier quote" close={() => setDialog(null)}><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void perform(() => addQuote.mutateAsync({ id, expectedVersion: view.version, supplier: String(data.get("supplier")), source: String(data.get("source")) }), "Added the original quote"); }}><label>Supplier<input name="supplier" required maxLength={120} autoFocus /></label><label>Original quote text<textarea name="source" rows={9} required maxLength={12000} placeholder="Paste text or CSV, including prices, quantity, shipping, tax, delivery and exclusions." /></label><p className="sl-fine">New facts stay unconfirmed until reviewed. The agent can extract them with source evidence.</p><button className="sl-button primary" disabled={busy}>{busy ? "Adding…" : "Add quote"}</button></form></Modal>}
      {dialog === "source" && selected && view && <Modal title="Replace the original quote" close={() => setDialog(null)}><form onSubmit={event => { event.preventDefault(); void perform(() => source.mutateAsync({ id, quoteId: selected.id, expectedVersion: view.version, source: String(new FormData(event.currentTarget).get("source")) }), "Replaced source; extraction needs review"); }}><label>New source text<textarea name="source" rows={10} required maxLength={12000} defaultValue={selected.source} autoFocus /></label><p className="sl-fine">Unlocked facts and exclusion review reset. Your locked corrections remain. You can undo this change.</p><button className="sl-button primary" disabled={busy}>Replace source</button></form></Modal>}
      {edit && view && <Modal title={"Correct " + FIELD_LABELS[edit.field]} close={() => setEdit(null)}><form onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget); const raw = String(data.get("value"));
        void perform(async () => {
          let value: FieldValue = raw;
          if (["unitMinor", "shippingMinor", "taxMinor"].includes(edit.field)) value = moneyInput(raw);
          if (edit.field === "quantity") value = Number(raw);
          return correct.mutateAsync({ id, quoteId: edit.quote.id, expectedVersion: view.version, field: edit.field, value, note: String(data.get("note")), locked: data.get("locked") === "on" });
        }, "Saved your correction and recalculated the decision");
      }}><label>{FIELD_LABELS[edit.field]}<input name="value" type={edit.field === "deliveryDate" ? "date" : "text"} defaultValue={typeof edit.quote.fields[edit.field].value === "number" && ["unitMinor", "shippingMinor", "taxMinor"].includes(edit.field) ? (Number(edit.quote.fields[edit.field].value) / 100).toFixed(2) : String(edit.quote.fields[edit.field].value ?? "")} required autoFocus /></label><label>Reason<input name="note" placeholder="e.g. Supplier confirmed a later delivery" defaultValue={edit.quote.fields[edit.field].note ?? ""} minLength={3} maxLength={300} required /></label><label className="sl-checkbox"><input name="locked" type="checkbox" defaultChecked />Lock this correction against agent changes</label><button className="sl-button primary" disabled={busy}>{busy ? "Saving…" : "Save correction"}</button></form></Modal>}
      {dialog === "ai" && <Modal title="Work with the buying agent" close={() => setDialog(null)}><p>The agent reads the same quotes, requirements and corrections you see. It uses Vultr and saves changes through your workspace actions, within the permissions you choose.</p><p className="sl-fine">Quote text and conversation are sent to Vultr for the agent's review.</p><button className="sl-button primary" disabled={sendingToAgent} onClick={() => void continueWithAgent()}>Continue with the agent ↗</button></Modal>}
    </div>
  </AgentSidebar>;
}
