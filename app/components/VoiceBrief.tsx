import { useEffect, useRef, useState, type FormEvent } from "react";
import { callAction, useActionMutation } from "@agent-native/core/client/hooks";
import { toast } from "sonner";
import type { BuyingBrief, DecisionView } from "../../shared/types";
import { moneyInput } from "../../shared/format";
import { BRIEF_RECORDING_MS, recordingBase64 } from "../lib/voice";

type Proposal = BuyingBrief & { version: number };
export function VoiceBrief({ view, refresh, blocked }: { view: DecisionView; refresh: () => Promise<unknown>; blocked: boolean }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(0);
  const update = useActionMutation("update-requirements");
  const stopTracks = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = () => { session.current++; if (recorder.current?.state === "recording") recorder.current.stop(); stopTracks(); setRecording(false); setBusy(false); setOpen(false); };
  useEffect(() => { if (open) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [open]);
  useEffect(() => () => { session.current++; if (recorder.current?.state === "recording") recorder.current.stop(); stopTracks(); }, []);
  useEffect(() => { close(); setTranscript(""); setProposal(null); }, [view.id]);
  async function understand(text: string) {
    setBusy(true);
    const attempt = session.current;
    try {
      const result = await callAction<Proposal>("parse-buying-brief", { id: view.id, transcript: text });
      if (attempt === session.current) setProposal(result);
    } catch (error) { if (attempt === session.current) toast.error(error instanceof Error ? error.message : "Please enter your requirements in the review."); }
    finally { if (attempt === session.current) setBusy(false); }
  }
  async function record() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("Microphone recording needs a supported browser with microphone access. You can type the same brief."); return; }
    setBusy(true);
    const attempt = session.current;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (attempt !== session.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture;
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(capture, preferred ? { mimeType: preferred } : {}), chunks: Blob[] = [];
      recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onstop = async () => {
        stopTracks();
        if (attempt !== session.current) return;
        setRecording(false); setBusy(true);
        try {
          const audioBase64 = await recordingBase64(new Blob(chunks, { type: media.mimeType }));
          const result = await callAction<{ transcript: string }>("transcribe-buying-brief", { id: view.id, audioBase64 });
          if (attempt !== session.current) return;
          setTranscript(result.transcript); setProposal(null);
          await understand(result.transcript);
        } catch (error) { if (attempt === session.current) toast.error(error instanceof Error ? error.message : "Please record again or type your brief."); }
        finally { if (attempt === session.current) setBusy(false); }
      };
      media.onerror = () => { stopTracks(); setRecording(false); setBusy(false); toast.error("Microphone recording failed. Please record again or type the brief."); };
      media.start(); setRecording(true); setBusy(false); setProposal(null);
      timer.current = setTimeout(() => { if (media.state === "recording") media.stop(); }, BRIEF_RECORDING_MS);
    } catch { stopTracks(); if (attempt === session.current) { setBusy(false); toast.error("Allow microphone access to record, or type your brief below."); } }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!proposal) return;
    const data = new FormData(event.currentTarget); setBusy(true);
    try {
      await update.mutateAsync({ id: view.id, expectedVersion: proposal.version, patch: { budgetMinor: moneyInput(String(data.get("budget"))), quantity: Number(data.get("quantity")), currency: String(data.get("currency")) as "USD" | "EUR" | "GBP", deliveryBy: String(data.get("deadline")) } });
      await refresh(); close(); toast.success("Reviewed buying brief saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Refresh the workspace before saving the brief."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  const req = { ...view.state.requirements, ...proposal?.patch };
  return <><button className="sl-button" disabled={blocked} onClick={() => setOpen(true)}>♫ Speak or type a brief</button>{open && <dialog ref={dialogRef} className="sl-modal sl-voice-modal" aria-labelledby="sl-voice-title" onCancel={close}><div className="sl-modal-top"><h2 id="sl-voice-title">Your buying brief</h2><button className="sl-icon" aria-label="Close buying brief" onClick={close}>×</button></div><p>Tell Shortlist what you need, your complete budget and when it should arrive. Vultr turns your voice into text and proposes requirements for your review.</p><button className={"sl-button " + (recording ? "sl-recording" : "primary")} disabled={busy} onClick={() => { if (recording) recorder.current?.stop(); else void record(); }}>{recording ? "■ Stop recording" : busy ? "Understanding your brief…" : "● Record"}</button><label className="sl-transcript-label">Buying brief<textarea aria-label="Buying brief" rows={4} value={transcript} disabled={busy || recording} maxLength={2400} placeholder="We need 100 kits, a complete budget of 590 US dollars, delivered by November 14, 2026." onChange={event => { setTranscript(event.target.value); setProposal(null); }} /></label><button className="sl-button" disabled={busy || recording || transcript.trim().length < 3} onClick={() => void understand(transcript)}>Review proposed requirements</button>{proposal && <form className="sl-brief-review" onSubmit={event => void save(event)}><h3>Review before saving</h3>{proposal.notes.map((note, i) => <p className="sl-fine" key={i}>{note}</p>)}{proposal.version !== view.version && <p className="sl-outdated" role="status">Your workspace changed while this brief was prepared. Review the proposed requirements again.</p>}<div className="sl-brief-fields"><label>Complete budget<input name="budget" aria-label="Brief complete budget" inputMode="decimal" defaultValue={(req.budgetMinor / 100).toFixed(2)} required /></label><label>Currency<select name="currency" aria-label="Brief currency" defaultValue={req.currency}><option>USD</option><option>EUR</option><option>GBP</option></select></label><label>Quantity<input name="quantity" aria-label="Brief quantity" type="number" min={1} max={100000} defaultValue={req.quantity} required /></label><label>Arrive by<input name="deadline" aria-label="Brief delivery deadline" type="date" defaultValue={req.deliveryBy} required /></label></div><details><summary>Words used for the proposed requirements</summary>{Object.entries(proposal.evidence).map(([key, quote]) => <p className="sl-fine" key={key}>{({ budgetMinor: "Budget", currency: "Currency", quantity: "Quantity", deliveryBy: "Delivery" } as Record<string, string>)[key]}: “{quote}”</p>)}</details><button className="sl-button primary" disabled={busy || proposal.version !== view.version}>Save reviewed requirements</button></form>}<p className="sl-fine">Audio and brief text are sent to Vultr when you use these controls. Review the transcript and requirements before saving.</p></dialog>}</>;
}
