import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { useApp, Topbar } from '../App';
import { Empty } from '../ui';
import { NotificationItem, useNotifications } from '../Notifications';

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'unread', label: 'Unread', match: (n) => !n.read },
  { key: 'assign', label: 'Assigned to me', match: (n) => n.type === 'assign' },
  { key: 'talk', label: 'Comments & mentions', match: (n) => n.type === 'comment' || n.type === 'mention' },
  { key: 'updates', label: 'Updates', match: (n) => ['status', 'update', 'attachment', 'subtask'].includes(n.type) },
];

export default function InboxPage({ collapsed, setCollapsed }) {
  const { unread } = useApp();
  const [filter, setFilter] = useState('all');
  const { items, open, readAll, toggleRead } = useNotifications();
  const f = FILTERS.find((x) => x.key === filter);
  const list = (items || []).filter(f.match);

  return (
    <>
      <Topbar collapsed={collapsed} setCollapsed={setCollapsed} crumbs={[{ label: 'Inbox' }]} />
      <div className="content">
        <div className="page" style={{ maxWidth: 820 }}>
          <div className="page-title"><span className="emoji">📥</span>Inbox</div>
          <p className="page-desc">Tickets assigned to you, comments, mentions and changes to your work. {unread ? <b>{unread} unread.</b> : 'You’re all caught up.'}</p>
          <div className="toolbar">
            <div className="filter-chips">
              {FILTERS.map((x) => (
                <button key={x.key} className={`chip-btn${filter === x.key ? ' on' : ''}`} onClick={() => setFilter(x.key)} aria-pressed={filter === x.key}>{x.label}</button>
              ))}
            </div>
            <span className="spacer" />
            {unread > 0 && <button className="btn ghost" onClick={readAll}><CheckCheck size={15} /> Mark all as read</button>}
          </div>
          {!items ? <div className="empty-state">Loading…</div> : !list.length ? (
            <Empty icon="📭" title={filter === 'all' ? "You're all caught up" : 'Nothing here'} text="New activity that involves you will show up here and under the bell at the top of the page." />
          ) : (
            <div className="notif-page">
              {list.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} onToggleRead={toggleRead} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
