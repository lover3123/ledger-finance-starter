import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ArrowRight, Plus } from "lucide-react";
import type { User, PaymentRequestDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "amber", ACCEPTED: "green", COMPLETED: "green",
  REJECTED: "red", CANCELLED: "red", EXPIRED: "red",
};

const TYPE_LABELS: Record<string, string> = {
  borrow: "Borrow", pay_on_behalf: "Pay on behalf", split_expense: "Split expense", gift: "Gift", other: "Other",
};

export function RequestsPage({ user, onLogout }: Props) {
  const [requests, setRequests] = useState<PaymentRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "incoming">("all");
  const navigate = useNavigate();

  async function load() {
    setLoading(true); setError("");
    try {
      setRequests(await api.getPaymentRequests(tab === "incoming" ? "incoming" : undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [tab]);

  const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="REQUESTS"
        title="Payment requests"
        subtitle="Track and manage all your payment requests."
        aside={
          <button className="primary small" onClick={() => navigate("/people")}>
            <Plus size={16} /> New request
          </button>
        }
      />

      {error && <div className="error banner">{error}</div>}

      <div className="tab-bar">
        <button className={`tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>All requests</button>
        <button className={`tab${tab === "incoming" ? " active" : ""}`} onClick={() => setTab("incoming")}>Incoming</button>
      </div>

      {loading ? <div className="loading-card">Loading requests...</div> : requests.length === 0 ? (
        <div className="empty-state">
          <Wallet size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <h3>No requests yet</h3>
          <p>Create a request from a person's profile.</p>
        </div>
      ) : (
        <div className="request-list">
          {requests.map((r) => (
            <div key={r.id} className="request-card clickable" onClick={() => navigate(`/requests/${r.requestId}`)}>
              <div className="request-left">
                <div className="avatar-circle">{r.sender.name[0]}</div>
                <div>
                  <strong>{r.reason}</strong>
                  <span className="muted">
                    {TYPE_LABELS[r.type]} · {r.sender.name} → {r.payer.name}
                  </span>
                </div>
              </div>
              <div className="request-right">
                <div className="request-amount">{money(r.amount)}</div>
                <div className="request-meta">
                  <span className={`badge badge-${STATUS_COLORS[r.status] || "blue"}`}>{r.status}</span>
                  <span className="muted">{formatRelative(r.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  </div>;
}
