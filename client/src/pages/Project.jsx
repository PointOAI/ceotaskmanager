import { useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Activity, Settings } from 'lucide-react';
import { api } from '../api';
import { useApp, Topbar, PROJECT_TABS } from '../App';
import { Avatar, Empty, ProjectIcon } from '../ui';
import Tickets from './Tickets';
import Meetings from './Meetings';
import Communication from './Communication';
import Events from './Events';
import Docs from './Docs';
import ProjectActivity from './ProjectActivity';
import ProjectSettings from './ProjectSettings';

export default function ProjectPage({ collapsed, setCollapsed }) {
  const { pid, tab = 'tickets' } = useParams();
  const { userMap, version, isAdmin } = useApp();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => api.get(`/projects/${pid}`).then(setProject).catch((e) => setError(e.message)), [pid]);
  useEffect(() => { setProject(null); setError(''); reload(); }, [reload]);
  useEffect(() => { if (project) reload(); }, [version]); // eslint-disable-line

  if (error) return (<><Topbar collapsed={collapsed} setCollapsed={setCollapsed} /><Empty icon="🔒" title="Can't open this project" text={error} action={<button className="btn" onClick={() => navigate('/')}>Go home</button>} /></>);
  if (!project) return <Topbar collapsed={collapsed} setCollapsed={setCollapsed} />;

  const tabs = [
    ...PROJECT_TABS,
    { tab: 'activity', label: 'Activity', icon: Activity },
    ...(isAdmin ? [{ tab: 'settings', label: 'Settings', icon: Settings }] : []),
  ];
  const current = tabs.find((t) => t.tab === tab) || tabs[0];
  const pct = project.ticket_total ? Math.round((project.ticket_done / project.ticket_total) * 100) : 0;

  return (
    <>
      <Topbar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        crumbs={[{ label: <><ProjectIcon project={project} /> {project.name}</>, to: `/p/${project.id}/tickets` }, { label: current.label }]}
        right={
          <div className="flex" style={{ gap: 10 }}>
            <span className="avatars" title={`${project.member_ids.length} members`}>
              {project.member_ids.slice(0, 5).map((id) => <Avatar key={id} user={userMap[id]} />)}
            </span>
            {project.member_ids.length > 5 && <span className="faint small">+{project.member_ids.length - 5}</span>}
          </div>
        }
      />
      <div className="content">
        <div className="page wide">
          <div className="page-title"><span className="emoji"><ProjectIcon project={project} size={28} /></span>{project.name}</div>
          <div className="flex muted small" style={{ gap: 14 }}>
            {project.description && <span>{project.description}</span>}
            <span className="flex" style={{ gap: 6 }}>
              <div className="progress" style={{ width: 90 }}><div style={{ width: `${pct}%` }} /></div>
              {project.ticket_done}/{project.ticket_total} tickets done
            </span>
            {project.archived && <span className="tag c-brown">Archived</span>}
          </div>
          <div className="tabs">
            {tabs.map(({ tab: t, label, icon: I }) => (
              <NavLink key={t} to={`/p/${project.id}/${t}`} className={`tab${t === current.tab ? ' active' : ''}`}>
                <I size={15} /> {label}
              </NavLink>
            ))}
          </div>
          {current.tab === 'tickets' && <Tickets project={project} reloadProject={reload} />}
          {current.tab === 'meetings' && <Meetings project={project} />}
          {current.tab === 'communication' && <Communication project={project} />}
          {current.tab === 'events' && <Events project={project} />}
          {current.tab === 'docs' && <Docs project={project} />}
          {current.tab === 'activity' && <ProjectActivity project={project} />}
          {current.tab === 'settings' && <ProjectSettings project={project} reload={reload} />}
        </div>
      </div>
    </>
  );
}
