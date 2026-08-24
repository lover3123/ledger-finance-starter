import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Coins, Settings, ArrowRight } from "lucide-react";
import type { User } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { CreateRequestModal } from "../components/CreateRequestModal";
import { SettlementModal } from "../components/SettlementModal";
import { RelationshipLimitsModal } from "../components/RelationshipLimitsModal";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

type RelDetail = {
  relationship: { _id: string; userA: string; userB: string; monthlyLimit: number; maxTransaction: number; maxOutstanding: number; usedAmount: string; usedMonth: string; status: string };
  friend: { id: string; name: string; email: string; upiId?: string };
  balance: { owedToMe: number; iOwe: number; net: number };
  recentActivity: { transactionId: string; merchantName: string; amount: number; type: string; status: string; createdAt: string }[];
};

export function PersonDetailPage({ user, onLogout }: Props) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showLimits, setShowLimits] = useState(false);

  async function loadRelationship() {
    if (!userId) return;
    setLoading(true); setError("");
    try {
      const rels = await api.getRelationships() as any[];
      // API returns [{relationship:{_id,...}, friend:{id,...}, balance:{...}}]
      const myRel = rels.find((r: any) => r.friend?.id === userId);
      if (!myRel) { setError("No relationship found with this person."); setLoading(false); return; }
      const relId = myRel.relationship?._id;
      if (!relId) { setError("Relationship ID not found."); setLoading(false); return; }
      const detail = await api.getRelationship(relId) as any;
      setDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load relationship");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadRelationship(); }, [userId]);

  const statusColor = (s: string) => {
    if (s === "COMPLETED") return "green";
    if (s === "FAILED" || s === "DISPUTED") return "red";
    if (s === "REQUESTED") return "amber";
    return "blue";
  };

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <button className="back-btn" onClick={() => navigate("/people")}>
        <ArrowLeft size={18} /> Back to People
      </button>

      {loading ? <div className="loading-card">Loading relationship...</div> : error ? (
        <div className="error" style={{ marginTop: 20 }}>{error}</div>
      ) : detail && <>
        <div className="person-header">
          <div className="avatar-circle large">{detail.friend.name[0]}</div>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>{detail.friend.name}</h2>
            <span className="badge-green">Connected</span>
          </div>
        </div>

        {/* Balance overview */}
        <div className="balance-overview">
          <div className="balance-card you-owe">
            <span className="eyebrow">YOU OWE</span>
            <strong>{money(detail.balance.iOwe)}</strong>
            <span>{detail.friend.name}</span>
          </div>
          <div className="balance-card owed-to-you">
            <span className="eyebrow">{detail.friend.name.toUpperCase()} OWES YOU</span>
            <strong>{money(detail.balance.owedToMe)}</strong>
            <span>To you</span>
          </div>
          <div className={`balance-card net ${detail.balance.net >= 0 ? "positive" : "negative"}`}>
            <span className="eyebrow">NET</span>
            <strong>{detail.balance.net >= 0 ? `+${money(detail.balance.net)}` : `−${money(Math.abs(detail.balance.net))}`}</strong>
            <span>{detail.balance.net > 0 ? `${detail.friend.name} owes you` : detail.balance.net < 0 ? `You owe ${detail.friend.name}` : "Settled up"}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="person-actions">
          <button className="primary" onClick={() => setShowCreateRequest(true)}>
            <Send size={16} /> Request money
          </button>
          <button className="secondary" onClick={() => setShowCreateRequest(true)}>
            <Coins size={16} /> Pay on behalf
          </button>
          <button className="secondary" onClick={() => setShowSettle(true)}>
            <Coins size={16} /> Settle balance
          </button>
          <button className="secondary" onClick={() => setShowLimits(true)}>
            <Settings size={16} /> Limits
          </button>
        </div>

        {/* Shared activity */}
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <div><div className="eyebrow">SHARED ACTIVITY</div><h3>Recent transactions</h3></div>
          </div>
          {(!detail.recentActivity || detail.recentActivity.length === 0) ? (
            <div className="empty">No shared activity yet.</div>
          ) : (
            <div className="activity-list">
              {detail.recentActivity.map((item) => (
                <div key={item.transactionId} className="activity-row clickable" onClick={() => navigate(`/pay/${item.transactionId}`)}>
                  <div className="activity-info">
                    <strong>{item.merchantName}</strong>
                    <span className="muted">{item.type.replace("_", " ")}</span>
                  </div>
                  <div className="activity-meta">
                    <span className={`badge badge-${statusColor(item.status)}`}>{item.status}</span>
                    <strong>{money(item.amount)}</strong>
                    <ArrowRight size={14} className="chevron" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Relationship limits */}
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <div><div className="eyebrow">RELATIONSHIP LIMIT</div><h3>Monthly limit</h3></div>
            <button className="link-btn" style={{ width: "auto", marginTop: 0 }} onClick={() => setShowLimits(true)}>Edit</button>
          </div>
          <div className="limits-grid">
            <div className="limit-item">
              <span>Monthly limit</span>
              <strong>{detail.relationship.monthlyLimit > 0 ? money(detail.relationship.monthlyLimit) : "No limit"}</strong>
            </div>
            <div className="limit-item">
              <span>Used</span>
              <strong>{money(Number(detail.relationship.usedAmount) || 0)}</strong>
            </div>
            <div className="limit-item">
              <span>Available</span>
              <strong>{detail.relationship.monthlyLimit > 0 ? money(Math.max(0, detail.relationship.monthlyLimit - (Number(detail.relationship.usedAmount) || 0))) : "Unlimited"}</strong>
            </div>
          </div>
        </div>
      </>}

      {showCreateRequest && userId && (
        <CreateRequestModal
          counterpartyId={userId}
          counterpartyName={detail?.friend.name ?? "Contact"}
          onClose={() => setShowCreateRequest(false)}
          onCreated={() => { setShowCreateRequest(false); void loadRelationship(); }}
        />
      )}
      {showSettle && detail && (
        <SettlementModal
          relationshipId={detail.relationship._id}
          balance={{ ...detail.balance, friend: detail.friend }}
          onClose={() => setShowSettle(false)}
          onSettled={() => { setShowSettle(false); void loadRelationship(); }}
        />
      )}
      {showLimits && detail && (
        <RelationshipLimitsModal
          relationshipId={detail.relationship._id}
          current={{ ...detail.relationship, friend: detail.friend } as any}
          onClose={() => setShowLimits(false)}
          onUpdated={() => { setShowLimits(false); void loadRelationship(); }}
        />
      )}
    </main>
  </div>;
}
