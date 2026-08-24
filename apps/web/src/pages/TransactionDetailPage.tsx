import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Upload, AlertTriangle, Clock } from "lucide-react";
import type { User, PayTransactionDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { money, fullDateLabel } from "../utils/format";

type Props = { user: User; onLogout: () => void };

const STATUS_INFO: Record<string, { color: string; label: string }> = {
  REQUESTED: { color: "amber", label: "Requested" },
  ACCEPTED: { color: "blue", label: "Accepted" },
  PAYMENT_STARTED: { color: "blue", label: "Payment started" },
  UPI_RETURNED: { color: "blue", label: "UPI returned" },
  PENDING_VERIFICATION: { color: "amber", label: "Pending verification" },
  EVIDENCE_SUBMITTED: { color: "blue", label: "Evidence submitted" },
  AWAITING_CONFIRMATION: { color: "amber", label: "Awaiting confirmation" },
  COMPLETED: { color: "green", label: "Completed" },
  REJECTED: { color: "red", label: "Rejected" },
  CANCELLED: { color: "red", label: "Cancelled" },
  FAILED: { color: "red", label: "Failed" },
  DISPUTED: { color: "red", label: "Disputed" },
};

export function TransactionDetailPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [txn, setTxn] = useState<PayTransactionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!id) return;
    setLoading(true); setError("");
    try {
      setTxn(await api.getPayTransaction(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transaction");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  async function handleSubmitEvidence() {
    if (!txn || !evidenceRef.trim()) { setError("Transaction reference is required."); return; }
    setSubmittingEvidence(true); setError("");
    try {
      const formData = new FormData();
      formData.append("transactionReference", evidenceRef.trim());
      if (evidenceNote.trim()) formData.append("note", evidenceNote.trim());
      if (evidenceFile) formData.append("file", evidenceFile);
      await api.submitEvidence(txn.transactionId, formData);
      setEvidenceFile(null); setEvidenceRef(""); setEvidenceNote("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit evidence");
    } finally { setSubmittingEvidence(false); }
  }

  async function handleConfirm() {
    if (!txn) return;
    setConfirming(true); setError("");
    try {
      await api.confirmPayment(txn.transactionId, `confirm-${txn.transactionId}-${Date.now()}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally { setConfirming(false); }
  }

  async function handleDispute() {
    if (!txn || !disputeReason.trim()) { setError("Please provide a reason."); return; }
    setDisputing(true); setError("");
    try {
      await api.disputePayment(txn.transactionId, disputeReason.trim());
      setShowDispute(false); setDisputeReason("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispute");
    } finally { setDisputing(false); }
  }

  const myId = user.id;
  const isPayer = txn?.payer.id === myId;
  const isBeneficiary = txn?.beneficiary.id === myId;
  const canSubmitEvidence = isPayer && ["PENDING_VERIFICATION", "EVIDENCE_SUBMITTED"].includes(txn?.status ?? "");
  const canConfirm = isBeneficiary && txn?.status === "AWAITING_CONFIRMATION";
  const canDispute = isBeneficiary && ["AWAITING_CONFIRMATION", "EVIDENCE_SUBMITTED", "PENDING_VERIFICATION"].includes(txn?.status ?? "");

  if (loading) return <div className="app-shell"><AppHeader user={user} onLogout={onLogout} /><main className="main"><div className="loading-card">Loading transaction...</div></main></div>;
  if (!txn) return <div className="app-shell"><AppHeader user={user} onLogout={onLogout} /><main className="main"><div className="error">{error || "Transaction not found."}</div></main></div>;

  const statusInfo = STATUS_INFO[txn.status] || { color: "blue", label: txn.status };

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="tx-detail">
        {/* Hero */}
        <div className="tx-detail-hero">
          <div className="eyebrow">TRANSACTION</div>
          <div className="tx-detail-amount">{money(txn.amount)}</div>
          <div className="tx-detail-merchant">{txn.merchantName}</div>
          <div className="tx-detail-parties">
            Paid by {txn.payer.name} · For {txn.beneficiary.name}
          </div>
          <span className={`badge badge-${statusInfo.color}`} style={{ marginTop: 8 }}>{statusInfo.label}</span>
        </div>

        {/* Verification status panel */}
        <div className="panel verification-panel">
          <div className="eyebrow">VERIFICATION STATUS</div>
          <div className="verification-grid">
            <div className="verification-item">
              <span>UPI APP RESULT</span>
              <span className={`badge badge-${txn.verification.upiAppResult === "RETURNED" ? "green" : txn.verification.upiAppResult === "NOT_STARTED" ? "blue" : "red"}`}>
                {txn.verification.upiAppResult}
              </span>
            </div>
            <div className="verification-item">
              <span>AUTHORITY VERIFICATION</span>
              <span className={`badge badge-${txn.verification.authority === "VERIFIED" ? "green" : "amber"}`}>
                {txn.verification.authority}
              </span>
            </div>
            <div className="verification-item">
              <span>RECEIVER CONFIRMATION</span>
              <span className={`badge badge-${txn.verification.receiverConfirmation === "CONFIRMED" ? "green" : txn.verification.receiverConfirmation === "REJECTED" ? "red" : "blue"}`}>
                {txn.verification.receiverConfirmation}
              </span>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="panel">
          <div className="detail-grid">
            <div className="detail-field">
              <span className="eyebrow">UPI ID</span>
              <strong>{txn.merchantUpiId}</strong>
            </div>
            {txn.request?.requestId && (
              <div className="detail-field">
                <span className="eyebrow">REQUEST ID</span>
                <strong>{txn.request.requestId}</strong>
              </div>
            )}
            {txn.session?.sessionId && (
              <div className="detail-field">
                <span className="eyebrow">PAYMENT SESSION</span>
                <strong>{txn.session.sessionId}</strong>
              </div>
            )}
            {txn.providerReference && (
              <div className="detail-field">
                <span className="eyebrow">PROVIDER REFERENCE</span>
                <strong>{txn.providerReference}</strong>
              </div>
            )}
            <div className="detail-field">
              <span className="eyebrow">CREATED</span>
              <strong>{fullDateLabel(txn.createdAt)}</strong>
            </div>
            {txn.dueDate && (
              <div className="detail-field">
                <span className="eyebrow">DUE DATE</span>
                <strong>{fullDateLabel(txn.dueDate)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Relationship balance */}
        {txn.netSentence && (
          <div className="panel">
            <div className="eyebrow">RELATIONSHIP</div>
            <strong>{txn.netSentence}</strong>
          </div>
        )}

        {/* Evidence section */}
        {txn.evidence.length > 0 && (
          <div className="panel">
            <div className="eyebrow">PAYMENT EVIDENCE</div>
            {txn.evidence.map((ev) => (
              <div key={ev.id} className="evidence-item">
                <div className="evidence-info">
                  <strong>{ev.transactionReference}</strong>
                  <span className="muted">Submitted by {ev.uploadedByName || "Payer"} · {fullDateLabel(ev.submittedAt)}</span>
                  {ev.note && <span className="muted">{ev.note}</span>}
                </div>
                <div className="evidence-meta">
                  {ev.fileUrl && <a href={ev.fileUrl} target="_blank" rel="noopener noreferrer" className="secondary small">View receipt</a>}
                  <span className={`badge badge-${ev.status === "ACCEPTED" ? "green" : ev.status === "FLAGGED" ? "amber" : "blue"}`}>{ev.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit evidence form */}
        {canSubmitEvidence && (
          <div className="panel">
            <div className="eyebrow">SUBMIT PAYMENT EVIDENCE</div>
            <p className="muted">Upload a screenshot or receipt to help verify this payment.</p>
            <label>
              Transaction reference
              <input type="text" placeholder="e.g., UPI reference number" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />
            </label>
            <label>
              Note (optional)
              <input type="text" placeholder="Additional notes" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} />
            </label>
            <label>
              Receipt/screenshot (optional)
              <input type="file" ref={fileInputRef} accept="image/*,.pdf" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="primary" onClick={() => void handleSubmitEvidence()} disabled={submittingEvidence}>
              <Upload size={16} /> {submittingEvidence ? "Submitting..." : "Submit evidence"}
            </button>
          </div>
        )}

        {/* Confirm / Dispute actions */}
        {canConfirm && (
          <div className="panel">
            <div className="eyebrow">CONFIRM PAYMENT</div>
            <p className="muted">The payer has submitted evidence. Please confirm whether you received this payment.</p>
            <div className="confirm-actions">
              <button className="primary green" onClick={() => void handleConfirm()} disabled={confirming}>
                <CheckCircle size={16} /> {confirming ? "Confirming..." : "Confirm payment"}
              </button>
              {!showDispute ? (
                <button className="secondary red" onClick={() => setShowDispute(true)}>
                  <XCircle size={16} /> Reject payment
                </button>
              ) : (
                <div className="dispute-form">
                  <label>
                    Why are you rejecting this payment?
                    <select value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
                      <option value="">Select a reason...</option>
                      <option value="Wrong amount">Wrong amount</option>
                      <option value="No payment received">No payment received</option>
                      <option value="Incorrect merchant">Incorrect merchant</option>
                      <option value="Duplicate payment">Duplicate payment</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  {disputeReason === "Other" && (
                    <input type="text" placeholder="Please explain..." value={disputeReason === "Other" ? "" : disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
                  )}
                  <div className="dispute-actions">
                    <button className="secondary" onClick={() => { setShowDispute(false); setDisputeReason(""); }}>Cancel</button>
                    <button className="primary red" onClick={() => void handleDispute()} disabled={disputing}>
                      {disputing ? "Submitting..." : "Submit dispute"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dispute info */}
        {txn.disputeReason && (
          <div className="panel dispute-panel">
            <div className="eyebrow">DISPUTE</div>
            <AlertTriangle size={16} style={{ color: "#d97706" }} />
            <strong>{txn.disputeReason}</strong>
          </div>
        )}

        {/* Audit timeline */}
        {txn.timeline.length > 0 && (
          <div className="panel">
            <div className="eyebrow">TIMELINE</div>
            <div className="timeline">
              {txn.timeline.map((event, i) => (
                <div key={event.id} className={`timeline-item${i === 0 ? " first" : ""}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <strong>{event.action.replace(/_/g, " ")}</strong>
                    <span className="muted">{fullDateLabel(event.createdAt)}</span>
                    {event.previousState && event.newState && (
                      <span className="muted">{event.previousState} → {event.newState}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}
    </main>
  </div>;
}
