import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Split, Plus, ArrowRight } from "lucide-react";
import type { User, FriendDTO, ExpenseSplitDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

export function SplitsPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [splits, setSplits] = useState<ExpenseSplitDTO[]>([]);
  const [friends, setFriends] = useState<FriendDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [splitData, friendData] = await Promise.all([api.getSplits(), api.getFriends()]);
      setSplits(splitData);
      setFriends(friendData.filter((f) => f.status === "ACCEPTED"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load splits");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function toggleFriend(id: string) {
    setSelectedFriends((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant.trim() || !totalAmount) { setError("Merchant and amount are required."); return; }
    if (selectedFriends.length === 0) { setError("Select at least one participant."); return; }
    const total = parseFloat(totalAmount);
    if (total <= 0) { setError("Amount must be positive."); return; }

    const allParticipants = [{ userId: user.id, share: 0 }, ...selectedFriends.map((id) => ({ userId: id, share: 0 }))];
    let participants: { userId: string; share: number }[];

    if (splitType === "equal") {
      const perHead = Math.round((total / allParticipants.length) * 100) / 100;
      participants = allParticipants.map((p, i) => ({
        userId: p.userId,
        share: i === 0 ? Math.round((total - perHead * (allParticipants.length - 1)) * 100) / 100 : perHead
      }));
    } else {
      participants = allParticipants.map((p) => ({
        userId: p.userId,
        share: p.userId === user.id ? 0 : parseFloat(customShares[p.userId] || "0")
      }));
    }

    setCreating(true); setError("");
    try {
      await api.createSplit({
        merchant: merchant.trim(),
        totalAmount: total,
        splitType,
        participants
      });
      setShowCreate(false);
      setMerchant(""); setTotalAmount(""); setSelectedFriends([]); setCustomShares({});
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create split");
    } finally { setCreating(false); }
  }

  const participantNames = (participants: { userId: string; name: string; share: number }[]) =>
    participants.map((p) => p.name).join(", ");

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="EXPENSE SPLIT"
        title="Split expenses"
        subtitle="Share costs with friends and track who owes what."
        aside={
          friends.length > 0 && (
            <button className="primary small" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New split
            </button>
          )
        }
      />

      {error && <div className="error banner">{error}</div>}

      {/* Create form */}
      {showCreate && (
        <div className="panel create-split-panel">
          <div className="panel-head">
            <div><div className="eyebrow">NEW SPLIT</div><h3>Create expense split</h3></div>
          </div>
          <form onSubmit={(e) => void handleCreate(e)} className="split-form">
            <label>
              Merchant / description
              <input type="text" placeholder="e.g., Restaurant" value={merchant} onChange={(e) => setMerchant(e.target.value)} required />
            </label>
            <label>
              Total amount (₹)
              <input type="number" step="0.01" min="1" placeholder="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} required />
            </label>

            <div className="eyebrow" style={{ marginTop: 8 }}>SPLIT TYPE</div>
            <div className="type-selector">
              <button type="button" className={`type-chip${splitType === "equal" ? " active" : ""}`} onClick={() => setSplitType("equal")}>Equal split</button>
              <button type="button" className={`type-chip${splitType === "custom" ? " active" : ""}`} onClick={() => setSplitType("custom")}>Custom split</button>
            </div>

            <div className="eyebrow" style={{ marginTop: 8 }}>PARTICIPANTS</div>
            <div className="friend-select">
              {friends.map((f) => (
                <div key={f.user.id} className={`friend-select-item${selectedFriends.includes(f.user.id) ? " selected" : ""}`} onClick={() => toggleFriend(f.user.id)}>
                  <div className="avatar-circle small">{f.user.name[0]}</div>
                  <span>{f.user.name}</span>
                  {selectedFriends.includes(f.user.id) && splitType === "custom" && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="₹"
                      value={customShares[f.user.id] || ""}
                      onChange={(e) => { e.stopPropagation(); setCustomShares((prev) => ({ ...prev, [f.user.id]: e.target.value })); }}
                      onClick={(e) => e.stopPropagation()}
                      className="share-input"
                    />
                  )}
                </div>
              ))}
            </div>

            {totalAmount && selectedFriends.length > 0 && (
              <div className="split-preview">
                <div className="eyebrow">SPLIT PREVIEW</div>
                <div>You: ₹{splitType === "equal" ? (parseFloat(totalAmount) / (selectedFriends.length + 1)).toFixed(2) : "0.00"}</div>
                {selectedFriends.map((id) => {
                  const f = friends.find((fr) => fr.user.id === id);
                  return <div key={id}>{f?.user.name}: ₹{splitType === "equal" ? (parseFloat(totalAmount) / (selectedFriends.length + 1)).toFixed(2) : customShares[id] || "0.00"}</div>;
                })}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="primary" disabled={creating}>{creating ? "Creating..." : "Create split"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Splits list */}
      {loading ? <div className="loading-card">Loading splits...</div> : splits.length === 0 ? (
        <div className="empty-state">
          <Split size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <h3>No splits yet</h3>
          <p>Create your first expense split above.</p>
        </div>
      ) : (
        <div className="split-list">
          {splits.map((s) => (
            <div key={s.id} className="split-card">
              <div className="split-card-header">
                <strong>{s.merchant}</strong>
                <span className="badge badge-blue">{s.splitType}</span>
              </div>
              <div className="split-card-amount">{money(s.totalAmount)}</div>
              <div className="split-card-participants">
                {participantNames(s.participants)}
              </div>
              <div className="split-card-shares">
                {s.participants.map((p) => (
                  <div key={p.userId} className="split-share">
                    <span>{p.name}</span>
                    <strong>{money(p.share)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  </div>;
}
