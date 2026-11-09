import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';
import { Avatar, ProjectIcon } from '../ui';
import { timeAgo, parseServer, fmtDate, toISODate } from '../lib';

export function ActivityFeed({ items, showProject, limit }) {
  const { userMap, projectMap, openTicket } = useApp();
  const list = limit ? items.slice(0, limit) : items;
  let lastDay = null;
  return (
    <div>
      {list.map((a) => {
        const d = parseServer(a.created_at);
        const day = d ? toISODate(d) : '';
        const header = !limit && day !== lastDay ? (lastDay = day) : null;
        const p = projectMap[a.project_id];
        return (
          <div key={a.id}>
            {header && <div className="faint small" style={{ padding: '12px 4px 4px', fontWeight: 600 }}>{fmtDate(header)}</div>}
            <div className="feed-item" style={{ cursor: a.ticket_id ? 'pointer' : 'default' }} onClick={() => a.ticket_id && openTicket(a.ticket_id)}>
              <Avatar user={userMap[a.user_id]} />
              <div className="txt">
                <b>{userMap[a.user_id]?.display_name || 'Someone'}</b> {a.action} <b>{a.detail}</b>
                {showProject && p && <span className="faint"> · <ProjectIcon project={p} /> {p.name}</span>}
              </div>
              <span className="when" title={d?.toLocaleString()}>{timeAgo(a.created_at)}</span>
            </div>
          </div>
        );
      })}
      {!list.length && <div className="empty-state">No activity yet.</div>}
    </div>
  );
}

export default function ProjectActivity({ project }) {
  const { version } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/projects/${project.id}/activity`).then(setItems); }, [project.id, version]);
  if (!items) return <div className="empty-state">Loading…</div>;
  return <div style={{ maxWidth: 760, marginTop: 8 }}><ActivityFeed items={items} /></div>;
}
