import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Send, Wallet } from "lucide-react";
import type { User, PaymentRequestDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { money, fullDateLabel } from "../utils/format";

type Props = { user: User; onLogout: () => void };

const STATUS_LABELS: Record<string, { color: string; label: string }> = {
  REQUESTED: { color: "amber", label: "Requested" },
  ACCEPTED: { color: "green", label: "Accepted" },
  COMPLETED: { color: "green", label: "Completed" },
  REJECTED: { color: "red", label: "Rejected" },
  CANCELLED: { color: "red", label: "Cancelled" },
  EXPIRED: { color: "red", label: "Expired" },
};

const TYPE_LABELS: Record<string, string> = {
  borrow: "Borrow", pay_on_behalf: "Pay on behalf", split_expense: "Split expense", gift: "Gift", other: "Other",
};

export function RequestDetailPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<PaymentRequestDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true); setError("");
    try {
      setRequest(await api.getPaymentRequest(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  async function handleAccept() {
    if (!request) return;
    setActionLoading(true);
    try {
      await api.acceptPaymentRequest(request.requestId);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    } finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!request) return;
    setActionLoading(true);
    try {
      await api.rejectPaymentRequest(request.requestId);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally { setActionLoading(false); }
  }

  async function handleCancel() {
    if (!request) return;
    setActionLoading(true);
    try {
      await api.cancelPaymentRequest(request.requestId);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally { setActionLoading(false); }
  }

  const myId = user.id;
  const isSender = request?.sender.id === myId;
  const isPayer = request?.payer.id === myId;
  const canPay = isPayer && request?.status === "ACCEPTED";
  const canAcceptReject = isPayer && request?.status === "REQUESTED";
  const canCancel = isSender && request?.status === "REQUESTED";

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <button className="back-btn" onClick={() => navigate("/requests")}>
        <ArrowLeft size={18} /> Back to Requests
      </button>

      {loading ? <div className="loading-card">Loading request...</div> : error ? (
        <div className="error" style={{ marginTop: 20 }}>{error}</div>
      ) : request ? (
        <div className="request-detail">
          <div className="request-detail-header">
            <div className="eyebrow">PAYMENT REQUEST</div>
            <div className="request-id-badge">{request.requestId}</div>
          </div>

          <div className="request-detail-hero">
            <div className="request-detail-merchant">{request.merchantName || request.reason}</div>
            <div className="request-detail-amount">{money(request.amount)}</div>
          </div>

          <div className="request-detail-grid">
            <div className="detail-field">
              <span className="eyebrow">REQUESTED BY</span>
              <strong>{request.sender.name}</strong>
            </div>
            <div className="detail-field">
              <span className="eyebrow">REQUESTED FROM</span>
              <strong>{request.payer.name}</strong>
            </div>
            <div className="detail-field">
              <span className="eyebrow">TYPE</span>
              <strong>{TYPE_LABELS[request.type]}</strong>
            </div>
            <div className="detail-field">
              <span className="eyebrow">REASON</span>
              <strong>{request.reason}</strong>
            </div>
            {request.description && (
              <div className="detail-field full-width">
                <span className="eyebrow">DESCRIPTION</span>
                <strong>{request.description}</strong>
              </div>
            )}
            {request.dueDate && (
              <div className="detail-field">
                <span className="eyebrow">DUE DATE</span>
                <strong>{fullDateLabel(request.dueDate)}</strong>
              </div>
            )}
            <div className="detail-field">
              <span className="eyebrow">STATUS</span>
              <span className={`badge badge-${STATUS_LABELS[request.status]?.color || "blue"}`}>
                {STATUS_LABELS[request.status]?.label || request.status}
              </span>
            </div>
            <div className="detail-field">
              <span className="eyebrow">CREATED</span>
              <strong>{fullDateLabel(request.createdAt)}</strong>
            </div>
          </div>

          {/* Actions */}
          {(canPay || canAcceptReject || canCancel) && (
            <div className="request-actions">
              {canPay && (
                <button className="primary" onClick={() => navigate(`/scan?requestId=${request.requestId}`)}>
                  <Send size={16} /> Pay now
                </button>
              )}
              {canAcceptReject && (
                <>
                  <button className="primary green" onClick={() => void handleAccept()} disabled={actionLoading}>
                    <Check size={16} /> Accept
                  </button>
                  <button className="secondary red" onClick={() => void handleReject()} disabled={actionLoading}>
                    <X size={16} /> Reject
                  </button>
                </>
              )}
              {canCancel && (
                <button className="secondary red" onClick={() => void handleCancel()} disabled={actionLoading}>
                  <X size={16} /> Cancel request
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
    </main>
  </div>;
}
