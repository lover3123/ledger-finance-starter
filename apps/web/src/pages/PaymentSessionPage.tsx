import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, CheckCircle, XCircle, AlertCircle, Loader } from "lucide-react";
import type { User } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

type Session = {
  id: string; sessionId: string; requestId?: string; transactionId?: string;
  merchantName: string; merchantUpiId: string; amount: number;
  upiIntent?: string; provider: string; status: string;
  appLinks: { name: string; url: string }[];
  sandbox: boolean; sandboxResult?: string;
};

export function PaymentSessionPage({ user, onLogout }: Props) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [returnResult, setReturnResult] = useState<string | null>(null);
  const [returnMessage, setReturnMessage] = useState("");
  const [verification, setVerification] = useState<Record<string, string> | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    api.getPaymentSession(sessionId)
      .then(setSession)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load session"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleReturn(result: string) {
    if (!sessionId || processing) return;
    setProcessing(true); setError("");
    try {
      const response = await api.returnPaymentSession(sessionId, { result });
      setReturnResult(result);
      setReturnMessage(response.message);
      setVerification(response.verification);
      if (session) setSession({ ...session, status: "RETURNED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record return");
    } finally { setProcessing(false); }
  }

  async function handleSandbox(result: string) {
    if (!sessionId) return;
    try {
      const response = await api.sandboxSimulate(sessionId, result);
      setReturnResult(response.result);
      setReturnMessage(`Sandbox simulation: ${response.result}. UPI Reference: ${response.upiTransactionReference}`);
      setVerification({ upiAppResult: result === "SUCCESS" ? "RETURNED" : "FAILED", authority: "NOT_AVAILABLE", receiverConfirmation: "PENDING" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox simulation failed");
    }
  }

  if (loading) return <div className="app-shell"><AppHeader user={user} onLogout={onLogout} /><main className="main"><div className="loading-card">Loading payment session...</div></main></div>;

  if (!session) return <div className="app-shell"><AppHeader user={user} onLogout={onLogout} /><main className="main"><div className="error">{error || "Session not found."}</div></main></div>;

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Back
      </button>

      {/* Sandbox banner */}
      {session.sandbox && (
        <div className="sandbox-banner">
          <AlertCircle size={16} /> SANDBOX MODE — Payments are simulated, not real.
        </div>
      )}

      {/* Session header */}
      <div className="payment-session-header">
        <div className="eyebrow">PAYMENT SESSION</div>
        <h2>{session.sessionId}</h2>
        <div className="session-merchant">{session.merchantName}</div>
        <div className="session-amount">{money(session.amount)}</div>
      </div>

      {/* Step 1: UPI Handoff */}
      {!returnResult && (
        <div className="panel">
          <div className="eyebrow">STEP 3 · PAYMENT</div>
          <h3>Open UPI app to pay</h3>
          <p className="muted">Tap a button below to open your preferred UPI app and complete the payment.</p>

          {session.appLinks.length > 0 ? (
            <div className="upi-app-links">
              {session.appLinks.map((link) => (
                <a key={link.name} href={link.url} className="upi-app-btn" target="_blank" rel="noopener noreferrer">
                  {link.name} <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">No UPI app links available. Use a UPI app to pay: {session.merchantUpiId}</p>
          )}

          {/* Return simulation */}
          <div className="return-actions">
            <p className="eyebrow" style={{ marginBottom: 8 }}>DID YOU COMPLETE THE PAYMENT?</p>
            <div className="return-buttons">
              <button className="primary green" onClick={() => void handleReturn("SUCCESS")} disabled={processing}>
                <CheckCircle size={16} /> Payment successful
              </button>
              <button className="secondary red" onClick={() => void handleReturn("FAILED")} disabled={processing}>
                <XCircle size={16} /> Payment failed
              </button>
              <button className="secondary" onClick={() => void handleReturn("CANCELLED")} disabled={processing}>
                Cancelled
              </button>
              <button className="secondary" onClick={() => void handleReturn("PENDING")} disabled={processing}>
                Still pending
              </button>
            </div>
          </div>

          {/* Sandbox controls */}
          {session.sandbox && (
            <div className="sandbox-controls">
              <div className="eyebrow">SANDBOX CONTROLS</div>
              <p className="muted">These controls only appear in development mode.</p>
              <div className="sandbox-buttons">
                <button className="sandbox-btn success" onClick={() => void handleSandbox("SUCCESS")}>SIMULATE SUCCESS</button>
                <button className="sandbox-btn danger" onClick={() => void handleSandbox("FAILED")}>SIMULATE FAILURE</button>
                <button className="sandbox-btn warning" onClick={() => void handleSandbox("PENDING")}>SIMULATE PENDING</button>
                <button className="sandbox-btn" onClick={() => void handleSandbox("CANCEL")}>SIMULATE CANCEL</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return result */}
      {returnResult && (
        <div className={`panel return-result ${returnResult === "SUCCESS" ? "success" : "failure"}`}>
          <div className="eyebrow">PAYMENT RESULT</div>
          <h3>{returnResult === "SUCCESS" ? "Payment returned successfully" : `Payment ${returnResult.toLowerCase()}`}</h3>
          <p className="muted">{returnMessage}</p>

          {/* Verification status */}
          {verification && (
            <div className="verification-status">
              <div className="verification-row">
                <span className="eyebrow">UPI APP RETURNED</span>
                <span className={`badge badge-${verification.upiAppResult === "RETURNED" ? "green" : "red"}`}>
                  {verification.upiAppResult}
                </span>
              </div>
              <div className="verification-row">
                <span className="eyebrow">AUTHORITY VERIFICATION</span>
                <span className="badge badge-amber">
                  {verification.authority}
                </span>
              </div>
              <div className="verification-row">
                <span className="eyebrow">RECEIVER CONFIRMATION</span>
                <span className="badge badge-blue">
                  {verification.receiverConfirmation}
                </span>
              </div>
            </div>
          )}

          {returnResult === "SUCCESS" && (
            <div className="return-next-steps">
              <p className="muted">Independent verification is unavailable. You may submit payment evidence.</p>
              <button className="primary" onClick={() => navigate(session?.transactionId ? `/pay/${session.transactionId}` : "/requests")}>
                Continue
              </button>
            </div>
          )}

          {returnResult !== "SUCCESS" && (
            <button className="secondary" onClick={() => navigate("/requests")}>Back to requests</button>
          )}
        </div>
      )}

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}
    </main>
  </div>;
}
