import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Archive, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { useAnchor, Person, Checkbox, StatusTag, SelectMenu, Tag, ProjectIconField } from '../ui';
import { COLORS } from '../lib';

export default function ProjectSettings({ project, reload }) {
  const { users, toast, confirm, reloadProjects } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [members, setMembers] = useState(project.member_ids);
  const [newCol, setNewCol] = useState('');
  const [colorFor, setColorFor] = useState(null);

  const patch = async (p) => {
    try { await api.patch(`/projects/${project.id}`, p); reload(); reloadProjects(); toast('Saved'); } catch (e) { toast(e.message, 'error'); }
  };
  const saveMembers = async () => {
    await api.put(`/projects/${project.id}/members`, { member_ids: members });
    reload(); reloadProjects(); toast('Members updated');
  };
  const moveCol = async (i, dir) => {
    const ids = project.statuses.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await api.put(`/projects/${project.id}/statuses/order`, { ids });
    reload();
  };
  const addCol = async () => {
    if (!newCol.trim()) return;
    await api.post(`/projects/${project.id}/statuses`, { name: newCol.trim(), color: COLORS[project.statuses.length % COLORS.length] });
    setNewCol('');
    reload();
  };
  const delCol = async (s) => {
    if (!(await confirm({ title: `Delete “${s.name}”?`, message: 'Tickets in this column move to the first remaining column.', danger: true, confirmText: 'Delete' }))) return;
    try { await api.del(`/statuses/${s.id}`); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const del = async () => {
    if (!(await confirm({ title: `Delete ${project.name}?`, message: 'All tickets, meetings, contacts, events and docs in this project will be permanently deleted. Consider archiving instead.', danger: true, confirmText: 'Delete forever' }))) return;
    await api.del(`/projects/${project.id}`);
    reloadProjects();
    navigate('/');
  };
  const activeUsers = users.filter((u) => u.active);

  return (
    <div style={{ maxWidth: 720, marginTop: 18 }}>
      <div className="section-title" style={{ marginTop: 0 }}>General</div>
      <div className="flex" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="field"><label>Icon</label><ProjectIconField icon={project.icon} image={project.icon_image} onChange={patch} onError={(m) => toast(m, 'error')} /></div>
        <div className="field grow"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== project.name && patch({ name: name.trim() })} /></div>
        <div className="field"><label>Key</label><span className="code-pill" style={{ height: 32, display: 'inline-grid', placeItems: 'center' }}>{project.key}</span></div>
      </div>
      <div className="field"><label>Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== project.description && patch({ description })} /></div>

      <div className="section-title">Ticket columns <span className="muted">— rename by double-clicking on the board too</span></div>
      <div className="panel">
        {project.statuses.map((s, i) => (
          <div key={s.id} className="list-row" style={{ cursor: 'default', borderRadius: 0, borderBottom: '1px solid var(--border)' }}>
            <button onClick={(e) => setColorFor({ s, a: e.currentTarget.getBoundingClientRect() })}><StatusTag status={s} /></button>
            <input className="bare-input grow" defaultValue={s.name} onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== s.name) { await api.patch(`/statuses/${s.id}`, { name: e.target.value.trim() }); reload(); } }} />
            <label className="flex small muted" style={{ gap: 6 }} title="Tickets here count as completed">
              <Checkbox checked={!!s.is_done} onChange={async (v) => { await api.patch(`/statuses/${s.id}`, { is_done: v }); reload(); }} /> Done column
            </label>
            <button className="icon-btn sm" disabled={i === 0} onClick={() => moveCol(i, -1)}><ArrowUp size={13} /></button>
            <button className="icon-btn sm" disabled={i === project.statuses.length - 1} onClick={() => moveCol(i, 1)}><ArrowDown size={13} /></button>
            <button className="icon-btn sm" onClick={() => delCol(s)}><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="list-row" style={{ cursor: 'default' }}>
          <Plus size={15} className="faint" />
          <input className="bare-input grow" placeholder="Add a column, e.g. Review, Waiting on client…" value={newCol} onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCol()} />
          <button className="btn sm" onClick={addCol} disabled={!newCol.trim()}>Add</button>
        </div>
      </div>
      <SelectMenu anchor={colorFor?.a} onClose={() => setColorFor(null)} searchable={false} value={colorFor?.s.color}
        onChange={async (color) => { await api.patch(`/statuses/${colorFor.s.id}`, { color }); reload(); }}
        options={COLORS.map((c) => ({ value: c, label: c, render: <Tag color={c} dot status>{c}</Tag> }))} />

      <div className="section-title">Members <span className="muted">— who can see and work in this project (admins always have access)</span></div>
      <div className="panel">
        {activeUsers.map((u) => (
          <label key={u.id} className="list-row" style={{ borderRadius: 0 }}>
            <Checkbox checked={members.includes(u.id) || u.role === 'admin'} onChange={(v) => u.role !== 'admin' && setMembers((m) => (v ? [...m, u.id] : m.filter((x) => x !== u.id)))} />
            <Person user={u} />
            <span className="faint small">@{u.username}</span>
            <span className="right">{u.role === 'admin' ? <Tag color="purple">Admin</Tag> : u.title}</span>
          </label>
        ))}
      </div>
      <div className="flex mt" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={saveMembers}>Save members</button></div>

      <div className="section-title">Danger zone</div>
      <div className="flex">
        <button className="btn" onClick={() => patch({ archived: !project.archived })}><Archive size={14} /> {project.archived ? 'Unarchive' : 'Archive'} project</button>
        <button className="btn danger" onClick={del}><Trash2 size={14} /> Delete project</button>
      </div>
      <p className="faint small">Archived projects are hidden from the sidebar but stay accessible from Admin.</p>
    </div>
  );
}
