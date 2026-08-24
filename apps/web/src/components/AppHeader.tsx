import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, ArrowLeftRight, Target, Settings, LogOut, Menu, X, Users, Wallet, HandCoins, Split, Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { User } from "@ledger/shared";
import { api } from "../api";

type Props = { user: User; onLogout: () => void };

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; badge?: number };

const CORE_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/budgets", label: "Budgets", icon: Target },
];

const PAY_ITEMS: NavItem[] = [
  { to: "/people", label: "People", icon: Users },
  { to: "/requests", label: "Requests", icon: Wallet },
  { to: "/lending", label: "Lending", icon: HandCoins },
  { to: "/splits", label: "Splits", icon: Split },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

const SETTINGS_ITEMS: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="nav-group">
      <div className="nav-group-label">{label}</div>
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          end={end}
          className={({ isActive }) => `top-nav-item${isActive ? " active" : ""}`}
          to={to}
        >
          <Icon size={16} strokeWidth={2.2} />
          <span>{label}</span>
          {badge != null && badge > 0 && <span className="nav-badge">{badge}</span>}
        </NavLink>
      ))}
    </div>
  );
}

export function AppHeader({ user, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (mobileOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => { document.body.style.overflow = ""; document.body.style.paddingRight = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const poll = () => api.getNotifications().then((r) => setUnread(r.unread)).catch(() => {});
    poll();
    const timer = setInterval(poll, 30_000);
    return () => clearInterval(timer);
  }, []);

  const payWithBadge = PAY_ITEMS.map((item) =>
    item.to === "/notifications" ? { ...item, badge: unread } : item
  );

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <strong>Ledger</strong>
            <span>Personal finance</span>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="top-nav">
          <NavGroup label="Finance" items={CORE_ITEMS} />
          <div className="nav-divider" />
          <NavGroup label="Pay" items={payWithBadge} />
          <div className="nav-divider" />
          <NavGroup label="" items={SETTINGS_ITEMS} />
        </nav>

        <div className="top-actions">
          <span className="user-chip">{user.name}</span>
          <button className="icon-btn" onClick={onLogout} title="Log out" aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div className={`mobile-drawer${mobileOpen ? " open" : ""}`}>
        <div className="mobile-drawer-head">
          <div className="brand">
            <div className="brand-mark">L</div>
            <div>
              <strong>Ledger</strong>
              <span>Personal finance</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <nav className="mobile-nav">
          {[...CORE_ITEMS, ...payWithBadge, ...SETTINGS_ITEMS].map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              end={end}
              className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`}
              to={to}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
              {badge != null && badge > 0 && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mobile-drawer-footer">
          <span className="user-chip">{user.name}</span>
          <button className="icon-btn" onClick={() => { setMobileOpen(false); onLogout(); }} title="Log out" aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </>
  );
}
