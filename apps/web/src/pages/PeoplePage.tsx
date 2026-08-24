import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus, Check, X, ArrowRight, Users } from "lucide-react";
import type { User, FriendDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

type SearchResult = { id: string; name: string; email: string; connectionStatus: string; direction: string };

export function PeoplePage({ user, onLogout }: Props) {
  const [friends, setFriends] = useState<FriendDTO[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function loadFriends() {
    setLoading(true); setError("");
    try {
      setFriends(await api.getFriends());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadFriends(); }, []);

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setSearchResults(await api.searchUsers(query));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function sendRequest(userId: string) {
    try {
      await api.sendFriendRequest(userId);
      setQuery(""); setSearchResults([]);
      void loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    }
  }

  async function acceptRequest(friendshipId: string) {
    try {
      await api.acceptFriend(friendshipId);
      void loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    }
  }

  async function rejectRequest(friendshipId: string) {
    try {
      await api.rejectFriend(friendshipId);
      void loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    }
  }

  async function removeFriend(friendshipId: string) {
    try {
      await api.removeFriend(friendshipId);
      void loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  const incoming = friends.filter((f) => f.status === "PENDING" && f.direction === "incoming");
  const outgoing = friends.filter((f) => f.status === "PENDING" && f.direction === "outgoing");
  const connected = friends.filter((f) => f.status === "ACCEPTED");

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="PEOPLE"
        title="Your connections"
        subtitle="Manage friends, send requests, and track shared activity."
      />

      {error && <div className="error banner">{error}<button onClick={() => setError("")}>Dismiss</button></div>}

      {/* Search */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>FIND PEOPLE</div>
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />
          {searching && <span className="search-spinner">...</span>}
        </div>
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((r) => (
              <div key={r.id} className="search-result-row">
                <div>
                  <strong>{r.name}</strong>
                  <span className="muted">{r.email}</span>
                </div>
                {r.connectionStatus === "NONE" ? (
                  <button className="primary small" onClick={() => void sendRequest(r.id)}>
                    <UserPlus size={14} /> Connect
                  </button>
                ) : r.connectionStatus === "PENDING" && r.direction === "outgoing" ? (
                  <span className="badge-muted">Request sent</span>
                ) : r.connectionStatus === "PENDING" && r.direction === "incoming" ? (
                  <span className="badge-muted">Has pending request</span>
                ) : (
                  <span className="badge-green">Connected</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? <div className="loading-card">Loading people...</div> : <>
        {/* Incoming requests */}
        {incoming.length > 0 && <div className="panel" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>INCOMING REQUESTS</div>
          {incoming.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <div className="friend-info">
                <div className="avatar-circle">{f.user.name[0]}</div>
                <div><strong>{f.user.name}</strong><span className="muted">{f.user.email}</span></div>
              </div>
              <div className="friend-actions">
                <button className="icon-btn green" onClick={() => void acceptRequest(f.friendshipId)} title="Accept"><Check size={16} /></button>
                <button className="icon-btn red" onClick={() => void rejectRequest(f.friendshipId)} title="Reject"><X size={16} /></button>
              </div>
            </div>
          ))}
        </div>}

        {/* Outgoing requests */}
        {outgoing.length > 0 && <div className="panel" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>SENT REQUESTS</div>
          {outgoing.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <div className="friend-info">
                <div className="avatar-circle">{f.user.name[0]}</div>
                <div><strong>{f.user.name}</strong><span className="muted">Waiting for response</span></div>
              </div>
              <button className="icon-btn red" onClick={() => void removeFriend(f.friendshipId)} title="Cancel"><X size={16} /></button>
            </div>
          ))}
        </div>}

        {/* Connected */}
        <div className="panel">
          <div className="panel-head">
            <div><div className="eyebrow">CONNECTED</div><h3>{connected.length} connection{connected.length !== 1 ? "s" : ""}</h3></div>
          </div>
          {connected.length === 0 ? (
            <div className="empty">
              <Users size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div>No connections yet. Search above to find people.</div>
            </div>
          ) : (
            <div className="friend-list">
              {connected.map((f) => (
                <div key={f.friendshipId} className="friend-row clickable" onClick={() => navigate(`/people/${f.user.id}`)}>
                  <div className="friend-info">
                    <div className="avatar-circle">{f.user.name[0]}</div>
                    <div>
                      <strong>{f.user.name}</strong>
                      <span className="muted">{f.user.email}</span>
                    </div>
                  </div>
                  <div className="friend-meta">
                    {f.netBalance != null && f.netBalance !== 0 && (
                      <span className={`balance-badge ${f.netBalance > 0 ? "positive" : "negative"}`}>
                        {f.netBalance > 0 ? `Owes you ${money(f.netBalance)}` : `You owe ${money(Math.abs(f.netBalance))}`}
                      </span>
                    )}
                    {(!f.netBalance || f.netBalance === 0) && <span className="badge-muted">Settled</span>}
                    <ArrowRight size={16} className="chevron" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}
    </main>
  </div>;
}
