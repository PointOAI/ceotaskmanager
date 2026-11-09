import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, MoreHorizontal, KeyRound, UserX, UserCheck, Pencil, Copy, Users, FolderKanban, Archive } from 'lucide-react';
import { api } from '../api';
import { useApp, Topbar } from '../App';
import { Person, Tag, Menu, useAnchor, Modal, Checkbox, ProjectIconField, ProjectIcon } from '../ui';
import { timeAgo } from '../lib';

export default function Admin({ collapsed, setCollapsed }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (params.get('new') === 'project' ? 'projects' : 'users');
  const setTab = (t) => setParams({ tab: t });
  return (
    <>
      <Topbar collapsed={collapsed} setCollapsed={setCollapsed} crumbs={[{ label: 'Admin' }]} />
      <div className="content">
        <div className="page">
          <div className="page-title"><span className="emoji">🛡️</span>Admin</div>
          <p className="page-desc">Create accounts, control who sees which project, and manage projects.</p>
          <div className="tabs">
            <button className={`tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}><Users size={15} /> Users</button>
            <button className={`tab${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')}><FolderKanban size={15} /> Projects</button>
          </div>
          {tab === 'users' ? <UsersAdmin /> : <ProjectsAdmin autoNew={params.get('new') === 'project'} clearNew={() => setParams({ tab: 'projects' })} />}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- users */
function UsersAdmin() {
  const { users, me, projects, reloadUsers, reloadProjects, toast, confirm } = useApp();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null);
  const projectsOf = (u) => (u.role === 'admin' ? projects : projects.filter((p) => p.member_ids.includes(u.id)));

  const reset = async (u) => {
    if (!(await confirm({ title: `Reset password for ${u.display_name}?`, message: `Their current password stops working and they'll be signed out. Next time they sign in with “${u.username}” they'll create a new password.`, confirmText: 'Reset password' }))) return;
    await api.post(`/users/${u.id}/reset-password`);
    reloadUsers();
    toast('Password reset — share the user ID again so they can set a new one');
  };
  const toggleActive = async (u) => {
    if (u.active && !(await confirm({ title: `Deactivate ${u.display_name}?`, message: 'They will be signed out and unable to sign in. Their tickets and history stay.', danger: true, confirmText: 'Deactivate' }))) return;
    try { await api.patch(`/users/${u.id}`, { active: !u.active }); reloadUsers(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="toolbar">
        <span className="muted small">{users.length} users</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New user</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>User ID</th><th>Role</th><th>Projects</th><th>Password</th><th>Last sign-in</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                <td><span className="flex"><Person user={u} />{u.title && <span className="faint small">{u.title}</span>}</span></td>
                <td><span className="code-pill">{u.username}</span></td>
                <td>{u.role === 'admin' ? <Tag color="purple">Admin</Tag> : <Tag>Member</Tag>}{!u.active && <Tag color="red">Deactivated</Tag>}</td>
                <td><span className="flex wrap" style={{ gap: 4 }}>{u.role === 'admin' ? <span className="faint small">All projects</span> : projectsOf(u).map((p) => <span key={p.id} title={p.name}><ProjectIcon project={p} /></span>)}{u.role !== 'admin' && !projectsOf(u).length && <span className="faint small">None</span>}</span></td>
                <td>{u.has_password ? <Tag color="green">Set</Tag> : <Tag color="yellow">Waiting for first sign-in</Tag>}</td>
                <td className="muted small">{u.last_login ? timeAgo(u.last_login) : 'Never'}</td>
                <td><UserMenu u={u} isMe={u.id === me.id} onEdit={() => setEditing(u)} onReset={() => reset(u)} onToggle={() => toggleActive(u)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel mt" style={{ padding: 14 }}>
        <b>How sign-in works</b>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Accounts aren't linked to email. Create a user ID here and send it to the person. The first time they sign in with that ID, they create their own password.
          If someone forgets their password, use <b>Reset password</b> — they'll set a new one at their next sign-in. Send IDs privately: until a password is set, whoever signs in first with that ID claims the account.
        </p>
      </div>
      {creating && <UserModal onClose={() => setCreating(false)} onDone={(u) => { setCreating(false); setCreated(u); reloadUsers(); reloadProjects(); }} />}
      {editing && <UserModal user={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reloadUsers(); reloadProjects(); toast('User updated'); }} />}
      {created && <CreatedModal u={created} onClose={() => setCreated(null)} />}
    </>
  );
}

function UserMenu({ u, isMe, onEdit, onReset, onToggle }) {
  const [a, open, close] = useAnchor();
  return (
    <>
      <button className="icon-btn" onClick={open}><MoreHorizontal size={16} /></button>
      <Menu anchor={a} onClose={close} align="right" items={[
        { label: 'Edit user & projects', icon: <Pencil size={14} />, onClick: onEdit },
        { label: 'Reset password', icon: <KeyRound size={14} />, onClick: onReset },
        !isMe && '-',
        !isMe && (u.active ? { label: 'Deactivate', icon: <UserX size={14} />, danger: true, onClick: onToggle } : { label: 'Reactivate', icon: <UserCheck size={14} />, onClick: onToggle }),
      ]} />
    </>
  );
}

function UserModal({ user, onClose, onDone }) {
  const { projects, toast, me } = useApp();
  const isEdit = !!user;
  const [d, setD] = useState({
    username: user?.username || '', display_name: user?.display_name || '', title: user?.title || '', role: user?.role || 'member', password: '',
  });
  const [pids, setPids] = useState([]);
  useEffect(() => { if (user) api.get(`/users/${user.id}/projects`).then(setPids); }, [user]);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    try {
      if (isEdit) {
        await api.patch(`/users/${user.id}`, { display_name: d.display_name, title: d.title, role: d.role });
        await api.put(`/users/${user.id}/projects`, { project_ids: pids });
        onDone();
      } else {
        const u = await api.post('/users', { ...d, password: d.password || undefined, project_ids: pids });
        onDone({ ...u, initialPassword: !!d.password });
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={isEdit ? `Edit ${user.display_name}` : 'New user'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>{isEdit ? 'Save' : 'Create user'}</button></>}>
      <div className="row">
        <div className="field"><label>Full name</label><input className="input" autoFocus value={d.display_name} onChange={set('display_name')} placeholder="Priya Sharma" /></div>
        <div className="field">
          <label>User ID</label>
          <input className="input" value={d.username} disabled={isEdit} onChange={set('username')} placeholder="PriyaSharma" />
          {!isEdit && <span className="hint">Used to sign in. Letters, numbers, . _ -</span>}
        </div>
      </div>
      <div className="row">
        <div className="field"><label>Title (optional)</label><input className="input" value={d.title} onChange={set('title')} placeholder="Marketing lead" /></div>
        <div className="field">
          <label>Access</label>
          <select className="select" value={d.role} onChange={set('role')} disabled={isEdit && user.id === me.id}>
            <option value="member">Team member — only assigned projects</option>
            <option value="admin">Admin — everything + user management</option>
          </select>
        </div>
      </div>
      {!isEdit && (
        <div className="field">
          <label>Initial password (optional)</label>
          <input className="input" type="text" value={d.password} onChange={set('password')} placeholder="Leave empty — they create it on first sign-in" />
        </div>
      )}
      {d.role !== 'admin' && (
        <div className="field">
          <label>Projects they can access</label>
          <div className="panel">
            {projects.map((p) => (
              <label key={p.id} className="list-row" style={{ borderRadius: 0 }}>
                <Checkbox checked={pids.includes(p.id)} onChange={(v) => setPids((x) => (v ? [...x, p.id] : x.filter((i) => i !== p.id)))} />
                <span><ProjectIcon project={p} /> {p.name}</span>
                {p.archived && <Tag color="brown">Archived</Tag>}
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreatedModal({ u, onClose }) {
  const { toast } = useApp();
  const url = window.location.origin;
  const msg = `Hi ${u.display_name.split(' ')[0]}, you've been added to Task Manager CEO.\n\nOpen: ${url}\nUser ID: ${u.username}\n\n${u.initialPassword ? 'Use the password I shared with you separately — you can change it under Account settings.' : 'The first time you sign in with this user ID you will create your own password.'}`;
  return (
    <Modal title="User created 🎉" onClose={onClose} footer={<>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(msg).then(() => toast('Invite message copied'))}><Copy size={14} /> Copy invite message</button>
      <button className="btn primary" onClick={onClose}>Done</button>
    </>}>
      <p className="muted" style={{ marginTop: 0 }}>Send this to <b>{u.display_name}</b> privately:</p>
      <pre className="panel" style={{ padding: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: 13.5, margin: 0, background: 'var(--bg-soft)' }}>{msg}</pre>
    </Modal>
  );
}

/* ---------------------------------------------------------------- projects */
function ProjectsAdmin({ autoNew, clearNew }) {
  const { projects, userMap, reloadProjects } = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(autoNew);
  useEffect(() => { if (autoNew) setCreating(true); }, [autoNew]);
  return (
    <>
      <div className="toolbar">
        <span className="muted small">{projects.length} projects</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New project</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Project</th><th>Key</th><th>Members</th><th>Tickets</th><th>Status</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => navigate(`/p/${p.id}/settings`)}>
                <td className="title-cell"><ProjectIcon project={p} /> {p.name} <span className="faint small">{p.description}</span></td>
                <td><span className="code-pill">{p.key}</span></td>
                <td><span className="avatars">{p.member_ids.slice(0, 8).map((id) => userMap[id] && <span key={id} className={`avatar c-${userMap[id].color}`} title={userMap[id].display_name}>{userMap[id].display_name[0]}</span>)}</span></td>
                <td className="muted">{p.ticket_done}/{p.ticket_total} done</td>
                <td>{p.archived ? <Tag color="brown"><Archive size={11} /> Archived</Tag> : <Tag color="green">Active</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint small">Click a project to edit members, columns, or archive it.</p>
      {creating && <NewProjectModal onClose={() => { setCreating(false); clearNew(); }} onCreated={(p) => { reloadProjects(); setCreating(false); navigate(`/p/${p.id}/tickets`); }} />}
    </>
  );
}

function NewProjectModal({ onClose, onCreated }) {
  const { users, toast } = useApp();
  const [d, setD] = useState({ name: '', key: '', icon: '📁', icon_image: null, description: '' });
  const [members, setMembers] = useState([]);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    if (!d.name.trim()) return toast('Project name is required', 'error');
    try { const p = await api.post('/projects', { ...d, member_ids: members }); toast(`${p.name} created`); onCreated(p); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="New project" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Create project</button></>}>
      <div className="flex" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div className="field"><label>Icon</label><ProjectIconField icon={d.icon} image={d.icon_image} onChange={(p) => setD((x) => ({ ...x, ...p }))} onError={(m) => toast(m, 'error')} /></div>
        <div className="field grow"><label>Name</label><input className="input" autoFocus value={d.name} onChange={set('name')} placeholder="e.g. Marketing" /></div>
        <div className="field" style={{ width: 100 }}><label>Key</label><input className="input" value={d.key} onChange={(e) => setD((x) => ({ ...x, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }))} placeholder="MKT" /></div>
      </div>
      <div className="field"><label>Description</label><input className="input" value={d.description} onChange={set('description')} /></div>
      <div className="field">
        <label>Team members</label>
        <div className="panel">
          {users.filter((u) => u.active && u.role !== 'admin').map((u) => (
            <label key={u.id} className="list-row" style={{ borderRadius: 0 }}>
              <Checkbox checked={members.includes(u.id)} onChange={(v) => setMembers((m) => (v ? [...m, u.id] : m.filter((x) => x !== u.id)))} />
              <Person user={u} />
            </label>
          ))}
          {!users.some((u) => u.active && u.role !== 'admin') && <div className="empty-state">No team members yet — admins have access automatically.</div>}
        </div>
        <span className="hint">Ticket columns start as To Do, In Progress, Blocked, Done — customize them anytime.</span>
      </div>
    </Modal>
  );
}
