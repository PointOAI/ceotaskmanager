import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp, Topbar } from '../App';
import { Menu, useAnchor, projectLabel } from '../ui';
import MonthCalendar, { monthRange } from '../MonthCalendar';

const TYPE = {
  meeting: { color: 'blue', label: 'Meetings', icon: '🗓️' },
  event: { color: 'purple', label: 'Events', icon: '🎪' },
  ticket: { color: 'orange', label: 'Ticket due dates', icon: '🎫' },
  followup: { color: 'green', label: 'Follow-ups', icon: '📞' },
};

export default function CalendarPage({ collapsed, setCollapsed }) {
  const { projects, projectMap, openTicket, version } = useApp();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [project, setProject] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [items, setItems] = useState([]);
  const [pa, openP, closeP] = useAnchor();

  useEffect(() => {
    const { from, to } = monthRange(month);
    api.get(`/calendar?from=${from}&to=${to}${project ? `&project=${project}` : ''}`).then(setItems);
  }, [month, project, version]);

  const go = (it) => {
    const base = `/p/${it.project_id}`;
    if (it.type === 'ticket') return openTicket(it.id);
    navigate({ meeting: `${base}/meetings?m=${it.id}`, event: `${base}/events?e=${it.id}`, followup: `${base}/communication?c=${it.contact_id}` }[it.type]);
  };
  const shown = items.filter((i) => !hidden.includes(i.type));

  return (
    <>
      <Topbar collapsed={collapsed} setCollapsed={setCollapsed} crumbs={[{ label: 'Calendar' }]} />
      <div className="content">
        <div className="page wide" style={{ maxWidth: 1400 }}>
          <div className="page-title"><span className="emoji">📅</span>Calendar</div>
          <p className="page-desc">Meetings, events, ticket deadlines and follow-ups across your projects.</p>
          <div className="toolbar">
            <div className="legend">
              {Object.entries(TYPE).map(([k, v]) => (
                <button key={k} className={`chip-btn c-${v.color}${hidden.includes(k) ? '' : ' on'}`} onClick={() => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--dot)', display: 'inline-block' }} /> {v.label}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <button className={`chip-btn${project ? ' on' : ''}`} onClick={openP}>{project ? projectLabel(projectMap[project]) : 'All projects'}</button>
            <Menu anchor={pa} onClose={closeP} align="right" items={[
              { label: 'All projects', checked: !project, onClick: () => setProject(null) },
              ...projects.filter((p) => !p.archived).map((p) => ({ label: projectLabel(p), checked: project === p.id, onClick: () => setProject(p.id) })),
            ]} />
          </div>
          <MonthCalendar
            month={month}
            setMonth={setMonth}
            items={shown.map((it) => ({
              key: `${it.type}-${it.id}`,
              date: it.date,
              end: it.end,
              title: `${project || projectMap[it.project_id]?.icon_image ? '' : (projectMap[it.project_id]?.icon || '') + ' '}${it.title}`,
              color: TYPE[it.type].color,
              done: it.done || it.status === 'Cancelled',
              onClick: () => go(it),
            }))}
          />
        </div>
      </div>
    </>
  );
}
