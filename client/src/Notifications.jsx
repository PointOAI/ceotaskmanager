import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, UserCheck, MessageSquare, AtSign, ArrowRightLeft, Paperclip, ListTree, Pencil, CalendarDays, FolderPlus, Check, CheckCheck, Inbox,
} from 'lucide-react';
import { api } from './api';
import { useApp } from './App';
import { Avatar, Popover, useAnchor } from './ui';
import { timeAgo, parseServer } from './lib';

export const NOTIF_TYPES = {
  assign: { icon: UserCheck, label: 'Assigned to you', color: 'blue' },
  comment: { icon: MessageSquare, label: 'Comment', color: 'purple' },
  mention: { icon: AtSign, label: 'Mentioned you', color: 'orange' },
  status: { icon: ArrowRightLeft, label: 'Status change', color: 'green' },
  update: { icon: Pencil, label: 'Ticket updated', color: 'yellow' },
  attachment: { icon: Paperclip, label: 'Attachment', color: 'gray' },
  subtask: { icon: ListTree, label: 'Sub-ticket', color: 'blue' },
  meeting: { icon: CalendarDays, label: 'Meeting', color: 'pink' },
  project: { icon: FolderPlus, label: 'Project', color: 'green' },
  general: { icon: Bell, label: 'Notification', color: 'gray' },
};

const DESKTOP_KEY = 'tmc-desktop-alerts';
export const desktopAlertsOn = () => {
  try { return localStorage.getItem(DESKTOP_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch { return false; }
};

/** One notification row: who did it, what happened, when; unread rows are highlighted. */
export function NotificationItem({ n, onOpen, onToggleRead }) {
  const { userMap } = useApp();
  const t = NOTIF_TYPES[n.type] || NOTIF_TYPES.general;
  const Icon = t.icon;
  return (
    <div className={`notif${n.read ? '' : ' unread'}`} role="button" tabIndex={0} onClick={() => onOpen(n)} onKeyDown={(e) => e.key === 'Enter' && onOpen(n)}>
      <span className="notif-avatar">
        {userMap[n.actor_id] ? <Avatar user={userMap[n.actor_id]} size="lg" /> : <span className="avatar lg unassigned"><Bell size={14} /></span>}
        <span className={`notif-type c-${t.color}`} title={t.label}><Icon size={10} strokeWidth={2.5} /></span>
      </span>
      <span className="notif-body">
        <span className="notif-msg">{n.message}</span>
        <span className="notif-meta" title={parseServer(n.created_at)?.toLocaleString()}>{t.label} · {timeAgo(n.created_at)}</span>
      </span>
      <button
        className="notif-dot"
        onClick={(e) => { e.stopPropagation(); onToggleRead(n); }}
        title={n.read ? 'Mark as unread' : 'Mark as read'}
        aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
      >
        <span />
      </button>
    </div>
  );
}

/** Shared list logic for the bell panel and the Inbox page. */
export function useNotifications(active = true) {
  const { reloadUnread, version } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const load = () => api.get('/notifications').then(setItems).catch(() => setItems([]));
  useEffect(() => { if (active) load(); }, [active, version]); // eslint-disable-line
  const setRead = async (n, read) => {
    setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: read ? 1 : 0 } : x)));
    await api.post(`/notifications/${n.id}/${read ? 'read' : 'unread'}`).catch(() => {});
    reloadUnread();
  };
  const open = (n, after) => {
    if (!n.read) setRead(n, true);
    after?.();
    navigate(n.link || '/');
  };
  const readAll = async () => {
    setItems((list) => list?.map((x) => ({ ...x, read: 1 })));
    await api.post('/notifications/read-all');
    reloadUnread();
  };
  return { items, open, readAll, toggleRead: (n) => setRead(n, !n.read), reload: load };
}

/** Jira-style bell in the top bar with an unread badge and a dropdown list. */
export function NotificationBell() {
  const { unread, toast } = useApp();
  const navigate = useNavigate();
  const [anchor, openPanel, close] = useAnchor();
  const [onlyUnread, setOnlyUnread] = useState(() => { try { return localStorage.getItem('tmc-notif-unread') === '1'; } catch { return false; } });
  const [desktop, setDesktop] = useState(desktopAlertsOn);
  const { items, open, readAll, toggleRead } = useNotifications(!!anchor);
  const list = (items || []).filter((n) => !onlyUnread || !n.read);

  const setUnreadOnly = (v) => { setOnlyUnread(v); try { localStorage.setItem('tmc-notif-unread', v ? '1' : '0'); } catch {} };
  const toggleDesktop = async () => {
    if (!('Notification' in window)) return toast('This browser does not support desktop alerts', 'error');
    if (desktop) { try { localStorage.setItem(DESKTOP_KEY, '0'); } catch {} return setDesktop(false); }
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (p !== 'granted') return toast('Desktop alerts are blocked — allow notifications for this site in your browser settings', 'error');
    try { localStorage.setItem(DESKTOP_KEY, '1'); } catch {}
    setDesktop(true);
    toast('Desktop alerts turned on');
  };

  return (
    <>
      <button className={`icon-btn bell${anchor ? ' on' : ''}`} onMouseDown={(e) => anchor && e.stopPropagation()} onClick={(e) => (anchor ? close() : openPanel(e))} title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell size={18} />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <Popover anchor={anchor} onClose={close} align="right" width="min(420px, calc(100vw - 16px))">
        <div className="notif-panel">
          <div className="notif-head">
            <h3>Notifications</h3>
            <button className="switch-row" role="switch" aria-checked={onlyUnread} onClick={() => setUnreadOnly(!onlyUnread)}>
              <span>Only show unread</span>
              <span className={`switch${onlyUnread ? ' on' : ''}`}><span /></span>
            </button>
          </div>
          <div className="notif-subhead">
            <span className="faint small">{unread ? `${unread} unread` : 'All caught up'}</span>
            {unread > 0 && <button className="link-btn small" onClick={readAll}><CheckCheck size={13} /> Mark all as read</button>}
          </div>
          <div className="notif-list">
            {!items ? (
              <div className="empty-state">Loading…</div>
            ) : !list.length ? (
              <div className="notif-empty">
                <span className="notif-empty-ico"><Check size={22} /></span>
                <b>{onlyUnread ? 'No unread notifications' : "You're all caught up"}</b>
                <span>You'll be notified here when someone assigns you a ticket, comments, mentions you, or changes your work.</span>
              </div>
            ) : (
              list.slice(0, 30).map((n) => <NotificationItem key={n.id} n={n} onOpen={(x) => open(x, close)} onToggleRead={toggleRead} />)
            )}
          </div>
          <div className="notif-foot">
            <button className="btn ghost sm" onClick={() => { close(); navigate('/inbox'); }}><Inbox size={14} /> Open inbox</button>
            <button className="btn ghost sm" onClick={toggleDesktop} title="Show a system notification when something new arrives, even in another tab">
              <Bell size={14} /> Desktop alerts: {desktop ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
