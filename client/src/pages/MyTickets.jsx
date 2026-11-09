import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useApp, Topbar } from '../App';
import { SearchInput, Empty, ProjectIcon } from '../ui';
import { TicketTable } from './Tickets';

export default function MyTickets({ collapsed, setCollapsed }) {
  const { version, openTicket, projectMap, toast } = useApp();
  const [tickets, setTickets] = useState(null);
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const load = () => api.get('/tickets/mine').then(setTickets);
  useEffect(() => { load(); }, [version]); // eslint-disable-line

  const isDone = (t) => !!projectMap[t.project_id]?.statuses?.find((s) => s.id === t.status_id)?.is_done;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tickets || []).filter((t) => (tab === 'open' ? !isDone(t) : isDone(t)) && (!s || t.title.toLowerCase().includes(s) || t.key.toLowerCase().includes(s)));
  }, [tickets, tab, q, projectMap]); // eslint-disable-line
  const groups = useMemo(() => {
    const g = {};
    list.forEach((t) => (g[t.project_id] = g[t.project_id] || []).push(t));
    return g;
  }, [list]);

  const update = async (t, patch) => {
    setTickets((all) => all.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    try { const u = await api.patch(`/tickets/${t.id}`, patch); setTickets((all) => all.map((x) => (x.id === t.id ? u : x))); } catch (e) { toast(e.message, 'error'); load(); }
  };

  return (
    <>
      <Topbar collapsed={collapsed} setCollapsed={setCollapsed} crumbs={[{ label: 'My tickets' }]} />
      <div className="content">
        <div className="page wide" style={{ maxWidth: 1300 }}>
          <div className="page-title"><span className="emoji">✅</span>My tickets</div>
          <p className="page-desc">Everything assigned to you across all projects.</p>
          <div className="toolbar">
            <div className="seg">
              <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Open</button>
              <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Completed</button>
            </div>
            <span className="spacer" />
            <SearchInput value={q} onChange={setQ} />
          </div>
          {!tickets ? <div className="empty-state">Loading…</div> : !list.length ? (
            <Empty icon={tab === 'open' ? '🎉' : '📭'} title={tab === 'open' ? 'All clear' : 'Nothing completed yet'} text={tab === 'open' ? 'No open tickets assigned to you.' : ''} />
          ) : (
            Object.entries(groups).map(([pid, ts]) => {
              const p = projectMap[pid];
              return (
                <div key={pid} className="mb">
                  <div className="section-title"><ProjectIcon project={p} /> {p?.name} <span className="muted">{ts.length}</span></div>
                  <TicketTable project={p} tickets={ts} update={update} openTicket={openTicket} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
