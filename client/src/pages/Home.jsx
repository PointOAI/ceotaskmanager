import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, AlertTriangle, BellRing, Users2, CalendarDays, Activity, ArrowRight, MapPin } from 'lucide-react';
import { api } from '../api';
import { useApp, Topbar } from '../App';
import { Tag, Avatar, Checkbox, ProjectIcon } from '../ui';
import { ActivityFeed } from './ProjectActivity';
import { fmtDate, fmtDateTime, greeting, isOverdue, priorityColor, todayISO, MONTHS_LONG, WEEKDAYS } from '../lib';

export default function Home({ collapsed, setCollapsed }) {
  const { me, projects, projectMap, openTicket, version, toast, userMap } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const load = () => api.get(`/dashboard?today=${todayISO()}`).then(setData);
  useEffect(() => { load(); }, [version]); // eslint-disable-line

  const now = new Date();
  const pkey = (pid) => projectMap[pid];
  const markFollowup = async (f) => {
    await api.patch(`/communications/${f.id}`, { next_done: true });
    toast('Follow-up done');
    load();
  };

  return (
    <>
      <Topbar collapsed={collapsed} setCollapsed={setCollapsed} crumbs={[{ label: 'Home' }]} />
      <div className="content">
        <div className="page">
          <div className="faint small" style={{ marginTop: 10 }}>{WEEKDAYS[now.getDay()]}, {MONTHS_LONG[now.getMonth()]} {now.getDate()}</div>
          <div className="page-title" style={{ marginBottom: 20 }}>{greeting()}, {me.display_name.split(' ')[0]}</div>
          {!data ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              <div className="grid cols-4 mb">
                <button className="stat" onClick={() => navigate('/my')}><span className="n">{data.my_open.length}</span><span className="l"><CheckSquare size={14} /> My open tickets</span></button>
                <div className={`stat${data.overdue.length ? ' warn' : ''}`}><span className="n">{data.overdue.length}</span><span className="l"><AlertTriangle size={14} /> Overdue tickets</span></div>
                <div className="stat"><span className="n">{data.followups.length}</span><span className="l"><BellRing size={14} /> Follow-ups this week</span></div>
                <button className="stat" onClick={() => navigate('/calendar')}><span className="n">{data.meetings.length + data.events.length}</span><span className="l"><CalendarDays size={14} /> Upcoming meetings & events</span></button>
              </div>

              <div className="grid cols-2 mb">
                <div className="panel">
                  <div className="panel-head"><CheckSquare size={15} /> My tickets <span className="muted">{data.my_open.length}</span><button className="btn ghost sm right" onClick={() => navigate('/my')}>View all <ArrowRight size={13} /></button></div>
                  <div className="panel-body">
                    {data.my_open.slice(0, 8).map((t) => (
                      <button key={t.id} className="list-row" onClick={() => openTicket(t.id)}>
                        <span className="faint small" style={{ width: 54, flex: 'none' }}>{t.key}</span>
                        <span className="main-t ellipsis">{t.title}</span>
                        <span className="right">
                          {t.priority !== 'Medium' && <Tag color={priorityColor(t.priority)}>{t.priority}</Tag>}
                          {t.due_date && <span style={{ color: isOverdue(t.due_date) ? 'var(--danger)' : undefined }}>{fmtDate(t.due_date)}</span>}
                        </span>
                      </button>
                    ))}
                    {!data.my_open.length && <div className="empty-state">🎉 Nothing assigned to you right now.</div>}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head"><CalendarDays size={15} /> Coming up</div>
                  <div className="panel-body">
                    {[...data.meetings.map((m) => ({ ...m, kind: 'meeting', when: m.date })), ...data.events.map((e) => ({ ...e, kind: 'event', when: e.start }))]
                      .sort((a, b) => a.when.localeCompare(b.when)).slice(0, 8)
                      .map((x) => (
                        <button key={x.kind + x.id} className="list-row" onClick={() => navigate(`/p/${x.project_id}/${x.kind === 'meeting' ? 'meetings?m=' : 'events?e='}${x.id}`)}>
                          <span style={{ fontSize: 16 }}>{x.kind === 'meeting' ? '🗓️' : '🎪'}</span>
                          <div className="main-t">
                            <div className="ellipsis">{x.title}</div>
                            <div className="sub"><ProjectIcon project={pkey(x.project_id)} /> {pkey(x.project_id)?.name}{x.location ? <> · <MapPin size={11} /> {x.location}</> : null}</div>
                          </div>
                          <span className="right">{fmtDateTime(x.when)}</span>
                        </button>
                      ))}
                    {!data.meetings.length && !data.events.length && <div className="empty-state">No upcoming meetings or events.</div>}
                  </div>
                </div>
              </div>

              <div className="grid cols-2 mb">
                <div className="panel">
                  <div className="panel-head"><BellRing size={15} /> Follow-ups due <span className="muted">overdue & next 7 days</span></div>
                  <div className="panel-body">
                    {data.followups.map((f) => (
                      <div key={f.id} className="list-row" onClick={() => navigate(`/p/${f.project_id}/communication?c=${f.contact_id}`)}>
                        <Checkbox checked={false} onChange={() => markFollowup(f)} />
                        <div className="main-t">
                          <div className="ellipsis"><b style={{ fontWeight: 500 }}>{f.contact_name}</b>{f.next_action ? ` — ${f.next_action}` : ''}</div>
                          <div className="sub"><ProjectIcon project={pkey(f.project_id)} /> {pkey(f.project_id)?.name}{f.contact_company ? ` · ${f.contact_company}` : ''}</div>
                        </div>
                        <span className="right"><Tag color={isOverdue(f.next_date) ? 'red' : 'yellow'}>{fmtDate(f.next_date)}</Tag></span>
                      </div>
                    ))}
                    {!data.followups.length && <div className="empty-state">No follow-ups due.</div>}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head"><AlertTriangle size={15} /> Overdue across projects</div>
                  <div className="panel-body">
                    {data.overdue.slice(0, 8).map((t) => (
                      <button key={t.id} className="list-row" onClick={() => openTicket(t.id)}>
                        <span className="faint small" style={{ width: 54, flex: 'none' }}>{t.key}</span>
                        <span className="main-t ellipsis">{t.title}</span>
                        <span className="right"><Avatar user={userMap[t.assignee_id]} /><span style={{ color: 'var(--danger)' }}>{fmtDate(t.due_date)}</span></span>
                      </button>
                    ))}
                    {!data.overdue.length && <div className="empty-state">Nothing overdue. 👏</div>}
                  </div>
                </div>
              </div>

              <div className="section-title">Projects</div>
              <div className="grid cols-3 mb">
                {projects.filter((p) => !p.archived).map((p) => {
                  const pct = p.ticket_total ? Math.round((p.ticket_done / p.ticket_total) * 100) : 0;
                  return (
                    <button key={p.id} className="project-card" onClick={() => navigate(`/p/${p.id}/tickets`)}>
                      <span className="nm"><span style={{ fontSize: 20, display: 'inline-flex' }}><ProjectIcon project={p} size={22} /></span> {p.name}</span>
                      <span className="muted small ellipsis">{p.description || ' '}</span>
                      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                      <span className="faint small">{p.ticket_done}/{p.ticket_total} tickets done · {p.member_ids.length} member{p.member_ids.length === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="panel">
                <div className="panel-head"><Activity size={15} /> Recent activity</div>
                <div className="panel-body"><ActivityFeed items={data.activity} showProject limit={15} /></div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

