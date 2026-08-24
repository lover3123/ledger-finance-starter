import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import type { User, NotificationDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";

type Props = { user: User; onLogout: () => void };

const TYPE_ICONS: Record<string, string> = {
  NEW_REQUEST: "📩",
  REQUEST_ACCEPTED: "✅",
  REQUEST_REJECTED: "❌",
  PAYMENT_STARTED: "💳",
  PAYMENT_RETURNED: "📱",
  CONFIRMATION_REQUIRED: "🔍",
  PAYMENT_CONFIRMED: "✅",
  PAYMENT_DISPUTED: "⚠️",
  PAYMENT_FAILED: "❌",
  PAYMENT_PENDING: "⏳",
  CONNECTION_REQUEST: "🤝",
  CONNECTION_ACCEPTED: "👥",
  SETTLEMENT_CREATED: "💰",
  SETTLEMENT_COMPLETED: "✅",
  LIMIT_APPROVAL_REQUESTED: "📋",
};

export function NotificationsPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const result = await api.getNotifications();
      setNotifications(result.notifications);
      setUnread(result.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch { /* silent */ }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* silent */ }
  }

  function handleClick(n: NotificationDTO) {
    if (!n.read) void markRead(n.id);
    if (n.relatedEntity === "payment-request" && n.relatedEntityId) {
      navigate(`/requests/${n.relatedEntityId}`);
    } else if (n.relatedEntity === "pay-transaction" && n.relatedEntityId) {
      navigate(`/pay/${n.relatedEntityId}`);
    } else if (n.relatedEntity === "people" && n.relatedEntityId) {
      navigate(`/people/${n.relatedEntityId}`);
    } else if (n.relatedEntity === "relationship" && n.relatedEntityId) {
      navigate(`/lending`);
    }
  }

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="NOTIFICATIONS"
        title="Notifications"
        subtitle={`${unread} unread notification${unread !== 1 ? "s" : ""}`}
        aside={
          unread > 0 && (
            <button className="secondary small" onClick={() => void markAllRead()}>
              <CheckCheck size={16} /> Mark all read
            </button>
          )
        }
      />

      {error && <div className="error banner">{error}</div>}

      {loading ? <div className="loading-card">Loading notifications...</div> : notifications.length === 0 ? (
        <div className="empty-state">
          <Bell size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <h3>No notifications</h3>
          <p>You're all caught up.</p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-item${n.read ? "" : " unread"} clickable`}
              onClick={() => handleClick(n)}
            >
              <div className="notification-icon">{TYPE_ICONS[n.type] || "📌"}</div>
              <div className="notification-content">
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <span className="muted">{formatTime(n.createdAt)}</span>
              </div>
              {!n.read && <div className="notification-dot" />}
            </div>
          ))}
        </div>
      )}
    </main>
  </div>;
}
