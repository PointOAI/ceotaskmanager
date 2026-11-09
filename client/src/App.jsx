import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import {
  Home as HomeIcon, Inbox, Calendar, Search, Settings, CheckSquare, Plus, ChevronRight, ChevronDown,
  LogOut, Moon, Sun, PanelLeftOpen, PanelLeftClose, Menu as MenuIcon, X, Shield, Ticket, Users2, MessagesSquare, CalendarDays, FileText, UserCog, ChevronsUpDown,
} from 'lucide-react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { Avatar, Modal, Menu, useAnchor, Person, ProjectIcon, projectLabel } from './ui';
import { COLORS } from './lib';
import Login from './pages/Login';
import Home from './pages/Home';
import ProjectPage from './pages/Project';
import MyTickets from './pages/MyTickets';
import InboxPage from './pages/Inbox';
import CalendarPage from './pages/CalendarPage';
import Admin from './pages/Admin';
import TicketPanel from './pages/TicketPanel';
import { NotificationBell, desktopAlertsOn } from './Notifications';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(!!getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); setMe(null); });
    if (!getToken()) return;
    api.get('/auth/me').then(setMe).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="login-wrap"><div className="faint">Loading…</div></div>;
  if (!me) return <Login onLogin={(token, user) => { setToken(token); setMe(user); }} />;
  return <Shell me={me} setMe={setMe} />;
}

function Shell({ me, setMe }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const isPhone = () => window.innerWidth < 760;
  const [collapsed, setCollapsedRaw] = useState(() => {
    if (isPhone()) return true;
    try { return localStorage.getItem('tmc-sidebar-collapsed') === '1'; } catch { return false; }
  });
  // On desktop the open/closed choice is remembered; on phones the sidebar is a drawer that starts closed.
  const setCollapsed = useCallback((v) => {
    setCollapsedRaw((c) => {
      const next = typeof v === 'function' ? v(c) : v;
      if (!isPhone()) try { localStorage.setItem('tmc-sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const reloadUsers = useCallback(() => api.get('/users').then(setUsers), []);
  const reloadProjects = useCallback(() => api.get('/projects').then(setProjects), []);
  // Poll the cheap unread counter; when a newer notification shows up, fetch it so we can pop a toast / desktop alert.
  const lastNotifId = useRef(null);
  const [arrived, setArrived] = useState([]);
  const reloadUnread = useCallback(
    () => api.get('/notifications/count').then(({ unread: n, latest_id }) => {
      setUnread(n);
      const prev = lastNotifId.current;
      lastNotifId.current = latest_id || 0;
      if (prev !== null && latest_id > prev) {
        api.get('/notifications').then((list) => setArrived(list.filter((x) => x.id > prev && !x.read))).catch(() => {});
      }
    }).catch(() => {}),
    []
  );
  useEffect(() => { reloadUsers(); reloadProjects(); reloadUnread(); }, [reloadUsers, reloadProjects, reloadUnread]);
  useEffect(() => {
    const t = setInterval(reloadUnread, 20000);
    const onFocus = () => document.visibilityState === 'visible' && reloadUnread();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [reloadUnread]);

  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setCollapsed((c) => !c); }
      if (e.key === 'Escape' && isPhone() && !document.querySelector('.peek, .overlay, .popover')) setCollapsed(true);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { if (isPhone()) setCollapsed(true); }, [location.pathname, setCollapsed]);

  // Phones: swipe right from the left edge opens the drawer, swipe left closes it.
  useEffect(() => {
    let start = null;
    const down = (e) => { const t = e.touches[0]; start = { x: t.clientX, y: t.clientY }; };
    const up = (e) => {
      if (!start || !isPhone()) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      if (dy < 60 && start.x < 24 && dx > 70) setCollapsed(false);
      if (dy < 60 && dx < -70 && document.querySelector('.sidebar:not(.collapsed)')) setCollapsed(true);
      start = null;
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    return () => { document.removeEventListener('touchstart', down); document.removeEventListener('touchend', up); };
  }, [setCollapsed]);

  // toast(message, type?, action?) — action is { label, onClick }, e.g. an Undo button.
  const toast = useCallback((msg, type = 'info', action = null) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), []);
  const bump = useCallback(() => { setVersion((v) => v + 1); reloadProjects(); }, [reloadProjects]);
  const openTicket = useCallback(
    (id) => {
      const p = new URLSearchParams(location.search);
      p.set('t', id);
      navigate(`${location.pathname}?${p.toString()}`);
    },
    [location, navigate]
  );
  const closeTicket = useCallback(() => {
    const p = new URLSearchParams(location.search);
    p.delete('t');
    const s = p.toString();
    navigate(`${location.pathname}${s ? '?' + s : ''}`, { replace: true });
  }, [location, navigate]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('tmc-theme', next); } catch {}
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    setToken(null);
    setMe(null);
    navigate('/');
  };
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  useEffect(() => {
    if (!arrived.length) return;
    arrived.slice(0, 3).reverse().forEach((n) => {
      if (document.hidden && desktopAlertsOn()) {
        try {
          const alert = new Notification('Task Manager CEO', { body: n.message, tag: `tmc-${n.id}` });
          alert.onclick = () => { window.focus(); navigate(n.link || '/inbox'); alert.close(); };
        } catch {}
      } else toast(`🔔 ${n.message}`);
    });
    if (arrived.length > 3) toast(`🔔 ${arrived.length - 3} more new notifications`);
    setArrived([]);
  }, [arrived, toast, navigate]);

  const ctx = {
    me, setMe, users, userMap, projects, projectMap, reloadUsers, reloadProjects, toast, confirm,
    version, bump, openTicket, isAdmin: me.role === 'admin', theme, toggleTheme, logout,
    reloadUnread, unread, setPaletteOpen, setAccountOpen,
  };
  const ticketId = params.get('t');

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} unread={unread} />
        <div className={`sidebar-scrim${collapsed ? '' : ' show'}`} onClick={() => setCollapsed(true)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Home collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/my" element={<MyTickets collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/inbox" element={<InboxPage collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/calendar" element={<CalendarPage collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/admin" element={me.role === 'admin' ? <Admin collapsed={collapsed} setCollapsed={setCollapsed} /> : <Navigate to="/" />} />
            <Route path="/p/:pid" element={<ProjectPage collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/p/:pid/:tab" element={<ProjectPage collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="/p/:pid/:tab/:sub" element={<ProjectPage collapsed={collapsed} setCollapsed={setCollapsed} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      {ticketId && <TicketPanel key={ticketId} id={ticketId} onClose={closeTicket} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
      {confirmState && (
        <Modal
          title={confirmState.title || 'Are you sure?'}
          onClose={() => { confirmState.resolve(false); setConfirmState(null); }}
          footer={
            <>
              <button className="btn" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>Cancel</button>
              <button
                autoFocus
                className={`btn ${confirmState.danger ? 'danger solid' : 'primary'}`}
                onClick={() => { confirmState.resolve(true); setConfirmState(null); }}
              >
                {confirmState.confirmText || 'Confirm'}
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: '4px 0 8px' }}>{confirmState.message}</p>
        </Modal>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
            {t.action && (
              <button className="toast-action" onClick={() => { setToasts((all) => all.filter((x) => x.id !== t.id)); t.action.onClick(); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/* ---------------------------------------------------------------- sidebar */
const PROJECT_TABS = [
  { tab: 'tickets', label: 'Tickets', icon: Ticket },
  { tab: 'meetings', label: 'Meetings', icon: Users2 },
  { tab: 'communication', label: 'Communication', icon: MessagesSquare },
  { tab: 'events', label: 'Events', icon: CalendarDays },
  { tab: 'docs', label: 'Docs', icon: FileText },
];
export { PROJECT_TABS };

function Sidebar({ collapsed, setCollapsed, unread }) {
  const { me, projects, isAdmin, setPaletteOpen, theme, toggleTheme, logout, setAccountOpen } = useApp();
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tmc-open-projects') || '{}'); } catch { return {}; }
  });
  const [menu, openMenu, closeMenu] = useAnchor();
  const location = useLocation();
  const navigate = useNavigate();
  const toggle = (id) => {
    const next = { ...open, [id]: !open[id] };
    setOpen(next);
    try { localStorage.setItem('tmc-open-projects', JSON.stringify(next)); } catch {}
  };
  const active = projects.filter((p) => !p.archived);
  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-hidden={collapsed} inert={collapsed ? true : undefined}>
      <div className="sidebar-head">
        <button className="workspace nav-item" onClick={openMenu}>
          <span className="logo">TM</span>
          <span className="grow">Task Manager CEO</span>
          <ChevronsUpDown size={14} className="faint" />
        </button>
        <button className="icon-btn" onClick={() => setCollapsed(true)} title={'Hide sidebar (Ctrl+\\)'} aria-label="Hide sidebar">
          <PanelLeftClose size={17} className="desktop-only" />
          <X size={18} className="mobile-only" />
        </button>
      </div>
      <Menu
        anchor={menu}
        onClose={closeMenu}
        items={[
          { label: `Signed in as ${me.username}` },
          { label: 'Account settings', icon: <UserCog size={15} />, onClick: () => setAccountOpen(true) },
          { label: theme === 'dark' ? 'Light mode' : 'Dark mode', icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />, onClick: toggleTheme },
          '-',
          { label: 'Log out', icon: <LogOut size={15} />, onClick: logout },
        ]}
      />
      <div className="sidebar-scroll">
        <button className="nav-item" onClick={() => setPaletteOpen(true)}>
          <Search size={16} /><span className="label">Search</span><span className="kbd">⌘K</span>
        </button>
        <NavLink to="/" end className="nav-item"><HomeIcon size={16} /><span className="label">Home</span></NavLink>
        <NavLink to="/my" className="nav-item"><CheckSquare size={16} /><span className="label">My tickets</span></NavLink>
        <NavLink to="/inbox" className="nav-item">
          <Inbox size={16} /><span className="label">Inbox</span>{unread > 0 && <span className="badge">{unread}</span>}
        </NavLink>
        <NavLink to="/calendar" className="nav-item"><Calendar size={16} /><span className="label">Calendar</span></NavLink>
        {isAdmin && <NavLink to="/admin" className="nav-item"><Shield size={16} /><span className="label">Admin</span></NavLink>}

        <div className="nav-section">
          <span>Projects</span>
          {isAdmin && <button title="New project" onClick={() => navigate('/admin?new=project')}><Plus size={14} /></button>}
        </div>
        {active.map((p) => {
          const isOpen = open[p.id] ?? location.pathname.startsWith(`/p/${p.id}`);
          return (
            <div key={p.id}>
              <div className="flex" style={{ gap: 0 }}>
                <NavLink to={`/p/${p.id}/tickets`} className={() => `nav-item project-item${isOpen ? ' expanded' : ''}${location.pathname.startsWith(`/p/${p.id}/`) || location.pathname === `/p/${p.id}` ? ' active' : ''}`}>
                  <span
                    className="icon-btn sm"
                    style={{ width: 18, height: 18, marginLeft: -4 }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(p.id); }}
                  >
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                  <span className="emoji"><ProjectIcon project={p} size={18} /></span>
                  <span className="label">{p.name}</span>
                </NavLink>
              </div>
              {isOpen && (
                <div className="nav-sub">
                  {PROJECT_TABS.map(({ tab, label, icon: I }) => (
                    <NavLink key={tab} to={`/p/${p.id}/${tab}`} className="nav-item">
                      <I size={14} /><span className="label">{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!active.length && <div className="faint small" style={{ padding: '4px 8px' }}>No projects yet</div>}
      </div>
      <div className="sidebar-foot">
        <button className="nav-item" onClick={() => setAccountOpen(true)}>
          <Avatar user={me} />
          <span className="label">{me.display_name}</span>
          <Settings size={14} className="faint" />
        </button>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- topbar used by pages */
export function Topbar({ crumbs = [], collapsed, setCollapsed, right }) {
  return (
    <div className="topbar">
      <button
        className={`icon-btn sidebar-toggle${collapsed ? ' attention' : ' sidebar-open'}`}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Show sidebar (Ctrl+\\)' : 'Hide sidebar (Ctrl+\\)'}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <MenuIcon size={19} className="mobile-only" />
        <span className="desktop-only"><PanelLeftOpen size={17} /></span>
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="flex" style={{ gap: 2, minWidth: 0 }}>
            {i > 0 && <span className="sep">/</span>}
            {c.to ? <NavLinkPlain to={c.to}>{c.label}</NavLinkPlain> : <span className="c">{c.label}</span>}
          </span>
        ))}
      </div>
      {right}
      <NotificationBell />
    </div>
  );
}
const NavLinkPlain = ({ to, children }) => {
  const navigate = useNavigate();
  return <a href={to} onClick={(e) => { e.preventDefault(); navigate(to); }}>{children}</a>;
};

/* ---------------------------------------------------------------- command palette */
function CommandPalette({ onClose }) {
  const { projects, isAdmin } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [focus, setFocus] = useState(0);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}), 160);
  }, [q]);

  const nav = [
    { type: 'go', title: 'Home', to: '/' },
    { type: 'go', title: 'My tickets', to: '/my' },
    { type: 'go', title: 'Inbox', to: '/inbox' },
    { type: 'go', title: 'Calendar', to: '/calendar' },
    ...(isAdmin ? [{ type: 'go', title: 'Admin · Users & projects', to: '/admin' }] : []),
    ...projects.filter((p) => !p.archived).map((p) => ({ type: 'project', title: projectLabel(p), to: `/p/${p.id}/tickets` })),
  ].filter((n) => !q.trim() || n.title.toLowerCase().includes(q.toLowerCase()));

  const linkFor = (r) => {
    if (r.to) return r.to;
    const base = `/p/${r.project_id}`;
    return {
      ticket: `${base}/tickets?t=${r.id}`,
      meeting: `${base}/meetings?m=${r.id}`,
      contact: `${base}/communication?c=${r.id}`,
      event: `${base}/events?e=${r.id}`,
      page: `${base}/docs/${r.id}`,
    }[r.type];
  };
  const items = [...results, ...nav];
  const go = (r) => { navigate(linkFor(r)); onClose(); };
  const projName = (id) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Search tickets, meetings, contacts, events, docs…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setFocus(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(f + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(f - 1, 0)); }
              if (e.key === 'Enter' && items[focus]) go(items[focus]);
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list">
          {items.map((r, i) => (
            <button key={`${r.type}-${r.id || r.to}`} className={`palette-item${i === focus ? ' focused' : ''}`} onMouseEnter={() => setFocus(i)} onClick={() => go(r)}>
              <span className="type">{r.type === 'go' ? 'Go to' : r.type}</span>
              <span className="ellipsis">{r.title}</span>
              <span className="sub">{r.sub ? r.sub : ''}{r.project_id ? ` · ${projName(r.project_id) || ''}` : ''}</span>
            </button>
          ))}
          {q && !items.length && <div className="empty-state">No results for “{q}”</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- account */
function AccountModal({ onClose }) {
  const { me, setMe, toast, reloadUsers, theme, toggleTheme } = useApp();
  const [name, setName] = useState(me.display_name);
  const [title, setTitle] = useState(me.title || '');
  const [color, setColor] = useState(me.color);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const saveProfile = async () => {
    try {
      const u = await api.patch('/auth/me', { display_name: name, title, color });
      setMe(u);
      reloadUsers();
      toast('Profile updated');
    } catch (e) { toast(e.message, 'error'); }
  };
  const changePw = async () => {
    if (pw !== pw2) return toast('New passwords do not match', 'error');
    try {
      await api.post('/auth/change-password', { current: cur, password: pw });
      setCur(''); setPw(''); setPw2('');
      toast('Password changed');
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="Account settings" onClose={onClose}>
      <div className="flex mb">
        <Person user={{ ...me, display_name: name, color }} size="lg" />
        <span className="code-pill">{me.username}</span>
        {me.role === 'admin' && <span className="tag c-purple">Admin</span>}
      </div>
      <div className="row">
        <div className="field"><label>Display name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Title / role</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Marketing lead" /></div>
      </div>
      <div className="field">
        <label>Avatar color</label>
        <div className="flex wrap">
          {COLORS.map((c) => (
            <button key={c} className={`avatar md c-${c}`} style={{ outline: color === c ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }} onClick={() => setColor(c)}>
              {color === c ? '✓' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="flex" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} {theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        <button className="btn primary" onClick={saveProfile}>Save profile</button>
      </div>
      <div className="divider" />
      <div className="section-title" style={{ marginTop: 0 }}>Change password</div>
      <div className="field"><label>Current password</label><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>New password</label><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="field"><label>Confirm</label><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      </div>
      <div className="flex" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" disabled={!cur || pw.length < 8} onClick={changePw}>Update password</button>
      </div>
    </Modal>
  );
}

export function useProjectFromParams() {
  const { pid } = useParams();
  return Number(pid);
}
