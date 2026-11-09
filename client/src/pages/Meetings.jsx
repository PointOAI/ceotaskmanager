import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Clock, Timer, CircleDot, Tag as TagIcon, Mic, Users, UserPlus, MapPin, ListTodo, NotebookPen, Gavel, ClipboardList,
  Trash2, MoreHorizontal, Link2, Unlink, Calendar, Copy,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { Peek, TitleInput, Prop, MarkdownField, DateField, Person, Avatar, Tag, Menu, useAnchor, InlineInput, Modal, SelectMenu, StatusTag, SearchInput, Empty, ProjectIcon } from '../ui';
import { OptionPicker, UserPicker, MultiUserPicker, useProjectPeople } from '../fields';
import { MEETING_STATUSES, MEETING_TYPES, fmtDate, fmtTime, todayISO, parseLocal, MONTHS, isOverdue } from '../lib';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const statusColor = (s) => MEETING_STATUSES.find((x) => x.value === s)?.color || 'gray';

export default function Meetings({ project }) {
  const { version, userMap, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [meetings, setMeetings] = useState(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const people = useProjectPeople(project);
  const openId = params.get('m');

  const load = useCallback(() => api.get(`/projects/${project.id}/meetings`).then(setMeetings), [project.id]);
  useEffect(() => { load(); }, [load, version]);

  const open = (id) => { const p = new URLSearchParams(params); p.set('m', id); setParams(p); };
  const close = () => { const p = new URLSearchParams(params); p.delete('m'); setParams(p, { replace: true }); load(); };

  const { upcoming, past, unscheduled } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (meetings || []).filter((m) => !s || m.title.toLowerCase().includes(s) || (m.notes || '').toLowerCase().includes(s) || (m.agenda || '').toLowerCase().includes(s));
    const t = todayISO();
    return {
      upcoming: list.filter((m) => m.date && m.date.slice(0, 10) >= t && m.status !== 'Completed').sort((a, b) => a.date.localeCompare(b.date)),
      past: list.filter((m) => m.date && (m.date.slice(0, 10) < t || m.status === 'Completed')),
      unscheduled: list.filter((m) => !m.date),
    };
  }, [meetings, q]);

  if (!meetings) return <div className="empty-state">Loading…</div>;
  return (
    <>
      <div className="toolbar">
        <span className="muted small">{meetings.length} meeting{meetings.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <SearchInput value={q} onChange={setQ} placeholder="Search meetings" />
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New meeting</button>
      </div>
      {!meetings.length ? (
        <Empty icon="🗓️" title="No meetings yet" text="Schedule a meeting, take notes, and turn decisions into action items." action={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New meeting</button>} />
      ) : (
        <>
          <MeetingGroup title="Upcoming" list={upcoming} open={open} userMap={userMap} />
          {unscheduled.length > 0 && <MeetingGroup title="No date" list={unscheduled} open={open} userMap={userMap} />}
          <MeetingGroup title="Past" list={past} open={open} userMap={userMap} />
        </>
      )}
      {creating && (
        <NewMeetingModal project={project} people={people} onClose={() => setCreating(false)} onCreated={(m) => { setCreating(false); load(); open(m.id); toast('Meeting created'); }} />
      )}
      {openId && <MeetingPanel key={openId} id={openId} project={project} people={people} onClose={close} />}
    </>
  );
}

function MeetingGroup({ title, list, open, userMap }) {
  return (
    <>
      <div className="section-title">{title} <span className="muted">{list.length}</span></div>
      {!list.length ? (
        <div className="faint small" style={{ padding: '4px 0 8px' }}>Nothing here.</div>
      ) : (
        <div className="panel" style={{ marginBottom: 8 }}>
          {list.map((m) => {
            const d = m.date ? parseLocal(m.date) : null;
            return (
              <button key={m.id} className="list-row" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)', padding: '10px 14px' }} onClick={() => open(m.id)}>
                <div style={{ width: 44, textAlign: 'center', flex: 'none' }}>
                  {d ? (<><div className="small faint" style={{ textTransform: 'uppercase', fontWeight: 600 }}>{MONTHS[d.getMonth()]}</div><div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div></>) : <span className="faint">—</span>}
                </div>
                <div className="main-t">
                  <div style={{ fontWeight: 500 }} className="ellipsis">{m.title}</div>
                  <div className="sub flex" style={{ gap: 8 }}>
                    {m.date && <span>{fmtTime(m.date)} · {m.duration} min</span>}
                    {m.location && <span className="ellipsis">· {m.location}</span>}
                  </div>
                </div>
                <div className="right">
                  <Tag color="gray">{m.meeting_type}</Tag>
                  {m.action_total > 0 && <span title="Action items done" className="flex" style={{ gap: 4 }}><ListTodo size={13} /> {m.action_done}/{m.action_total}</span>}
                  <span className="avatars">
                    {[m.host_id, ...m.attendees.filter((a) => a !== m.host_id)].slice(0, 4).map((id) => userMap[id] && <Avatar key={id} user={userMap[id]} />)}
                  </span>
                  <Tag color={statusColor(m.status)} dot status>{m.status}</Tag>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function NewMeetingModal({ project, people, onClose, onCreated }) {
  const { me, toast } = useApp();
  const [d, setD] = useState({ title: '', date: `${todayISO()}T10:00`, duration: 30, meeting_type: 'Internal', host_id: me.id, attendees: [], location: '', agenda: '' });
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    if (!d.title.trim()) return toast('Give the meeting a title', 'error');
    try { onCreated(await api.post(`/projects/${project.id}/meetings`, d)); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="New meeting" onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Create meeting</button></>}>
      <input className="title-input" style={{ fontSize: 24 }} autoFocus placeholder="Meeting title" value={d.title} onChange={(e) => set('title')(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <div className="props">
        <Prop icon={<Clock size={15} />} label="Date & time" static><DateField withTime value={d.date} onChange={set('date')} /></Prop>
        <Prop icon={<Timer size={15} />} label="Duration" static><OptionPicker options={DURATIONS.map((x) => ({ value: x, color: 'gray' }))} value={d.duration} onChange={set('duration')} className="cell-btn" /><span className="faint small">min</span></Prop>
        <Prop icon={<TagIcon size={15} />} label="Type" static><OptionPicker options={MEETING_TYPES} value={d.meeting_type} onChange={set('meeting_type')} className="cell-btn" /></Prop>
        <Prop icon={<Mic size={15} />} label="Hosted by" static><UserPicker people={people} value={d.host_id} onChange={set('host_id')} className="cell-btn" /></Prop>
        <Prop icon={<Users size={15} />} label="Attendees" static><MultiUserPicker people={people} value={d.attendees} onChange={set('attendees')} className="cell-btn" /></Prop>
        <Prop icon={<MapPin size={15} />} label="Location / link" static><input className="bare-input" placeholder="Office, Zoom/Meet link…" value={d.location} onChange={(e) => set('location')(e.target.value)} /></Prop>
      </div>
      <textarea className="textarea" rows={4} placeholder="Agenda (markdown supported)…" value={d.agenda} onChange={(e) => set('agenda')(e.target.value)} />
    </Modal>
  );
}

export function MeetingPanel({ id, project, people, onClose }) {
  const { userMap, toast, bump, confirm, openTicket, version } = useApp();
  const [m, setM] = useState(null);
  const [menu, openMenu, closeMenu] = useAnchor();
  const [newItem, setNewItem] = useState({ title: '', assignee_id: null, due_date: null });
  const [linkAnchor, openLink, closeLink] = useAnchor();
  const [projectTickets, setProjectTickets] = useState([]);

  const load = useCallback(() => api.get(`/meetings/${id}`).then(setM).catch((e) => toast(e.message, 'error')), [id, toast]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { if (linkAnchor) api.get(`/projects/${project.id}/tickets`).then(setProjectTickets); }, [linkAnchor, project.id]);

  const save = async (patch) => {
    setM((x) => ({ ...x, ...patch }));
    try { const u = await api.patch(`/meetings/${id}`, patch); setM((x) => ({ ...x, ...u })); } catch (e) { toast(e.message, 'error'); load(); }
  };
  const addItem = async () => {
    if (!newItem.title.trim()) return;
    try {
      await api.post(`/projects/${project.id}/tickets`, { ...newItem, meeting_id: Number(id), tags: ['action-item'] });
      setNewItem({ title: '', assignee_id: newItem.assignee_id, due_date: newItem.due_date });
      load();
      bump();
    } catch (e) { toast(e.message, 'error'); }
  };
  const link = async (ticketId) => { await api.patch(`/tickets/${ticketId}`, { meeting_id: Number(id) }); load(); bump(); };
  const unlink = async (ticketId) => { await api.patch(`/tickets/${ticketId}`, { meeting_id: null }); load(); bump(); };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete meeting?', message: 'Notes will be deleted. Linked action-item tickets are kept but unlinked.', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/meetings/${id}`);
    toast('Meeting deleted');
    onClose();
  };
  const copySummary = () => {
    const lines = [
      `# ${m.title}`, m.date ? `${fmtDate(m.date, { relative: false })} ${fmtTime(m.date)} · ${m.duration} min` : '',
      `Host: ${userMap[m.host_id]?.display_name || '-'}`,
      `Attendees: ${m.attendees.map((a) => userMap[a]?.display_name).filter(Boolean).join(', ')}${m.external_attendees ? ', ' + m.external_attendees : ''}`,
      '', '## Agenda', m.agenda || '-', '', '## Notes', m.notes || '-', '', '## Decisions', m.decisions || '-', '', '## Action items',
      ...m.action_items.map((t) => `- [${t.completed_at ? 'x' : ' '}] ${t.key} ${t.title}${t.assignee_id ? ' — ' + userMap[t.assignee_id]?.display_name : ''}${t.due_date ? ' (due ' + fmtDate(t.due_date, { relative: false }) + ')' : ''}`),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Meeting summary copied'), () => toast('Could not copy', 'error'));
  };

  if (!m) return <Peek onClose={onClose} wide><div className="empty-state">Loading…</div></Peek>;
  const linkable = projectTickets.filter((t) => t.meeting_id !== m.id);

  return (
    <Peek onClose={onClose} wide head={<span><ProjectIcon project={project} /> {project.name} / Meetings</span>}>
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        <button className="icon-btn" onClick={openMenu}><MoreHorizontal size={18} /></button>
        <Menu anchor={menu} onClose={closeMenu} align="right" items={[
          { label: 'Copy summary (markdown)', icon: <Copy size={15} />, onClick: copySummary },
          '-',
          { label: 'Delete meeting', icon: <Trash2 size={15} />, danger: true, onClick: remove },
        ]} />
      </div>
      <TitleInput value={m.title} onSave={(title) => save({ title })} />
      <div className="props">
        <Prop icon={<Clock size={15} />} label="Date & time" static><DateField withTime value={m.date} onChange={(date) => save({ date })} /></Prop>
        <Prop icon={<Timer size={15} />} label="Duration" static><OptionPicker options={DURATIONS.map((x) => ({ value: x, color: 'gray' }))} value={m.duration} onChange={(duration) => save({ duration })} className="cell-btn" /><span className="faint small">min</span></Prop>
        <Prop icon={<CircleDot size={15} />} label="Status" static><OptionPicker options={MEETING_STATUSES} value={m.status} onChange={(status) => save({ status })} className="cell-btn" /></Prop>
        <Prop icon={<TagIcon size={15} />} label="Type" static><OptionPicker options={MEETING_TYPES} value={m.meeting_type} onChange={(meeting_type) => save({ meeting_type })} className="cell-btn" /></Prop>
        <Prop icon={<Mic size={15} />} label="Hosted by" static><UserPicker people={people} value={m.host_id} onChange={(host_id) => save({ host_id })} className="cell-btn" /></Prop>
        <Prop icon={<Users size={15} />} label="Attendees" static><MultiUserPicker people={people} value={m.attendees} onChange={(attendees) => save({ attendees })} className="cell-btn" /></Prop>
        <Prop icon={<UserPlus size={15} />} label="External guests" static><InlineInput value={m.external_attendees} onSave={(external_attendees) => save({ external_attendees })} placeholder="Names of people outside the team" /></Prop>
        <Prop icon={<MapPin size={15} />} label="Location / link" static><InlineInput value={m.location} onSave={(location) => save({ location })} placeholder="Office, Zoom/Meet link…" /></Prop>
      </div>

      <div className="section-title"><ClipboardList size={15} /> Agenda</div>
      <MarkdownField value={m.agenda} onSave={(agenda) => save({ agenda })} placeholder="What will be discussed?" minHeight={70} />

      <div className="section-title"><NotebookPen size={15} /> Meeting notes — what happened</div>
      <MarkdownField value={m.notes} onSave={(notes) => save({ notes })} placeholder="Capture discussion points, updates, context…" />

      <div className="section-title"><Gavel size={15} /> Decisions</div>
      <MarkdownField value={m.decisions} onSave={(decisions) => save({ decisions })} placeholder="What was decided?" minHeight={60} />

      <div className="section-title">
        <ListTodo size={15} /> Action items <span className="muted">{m.action_done}/{m.action_total} done</span>
        <span style={{ marginLeft: 'auto' }}><button className="btn sm ghost" onClick={openLink}><Link2 size={13} /> Link existing ticket</button></span>
      </div>
      <SelectMenu anchor={linkAnchor} onClose={closeLink} width={340} value={null} onChange={link} placeholder="Search tickets…"
        options={linkable.map((t) => ({ value: t.id, label: `${t.key} ${t.title}`, render: <span className="flex"><span className="faint small">{t.key}</span><span className="ellipsis">{t.title}</span></span> }))} />
      <div className="panel">
        {m.action_items.map((t) => {
          const st = project.statuses.find((s) => s.id === t.status_id);
          return (
            <div key={t.id} className="list-row" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)' }} onClick={() => openTicket(t.id)}>
              <StatusTag status={st} />
              <span className="main-t ellipsis" style={{ textDecoration: st?.is_done ? 'line-through' : 'none', color: st?.is_done ? 'var(--text-3)' : undefined }}>{t.title}</span>
              <span className="right">
                <span className="faint">{t.key}</span>
                {t.due_date && <span style={{ color: isOverdue(t.due_date) && !st?.is_done ? 'var(--danger)' : undefined }}><Calendar size={12} /> {fmtDate(t.due_date)}</span>}
                <Person user={userMap[t.assignee_id]} empty="Unassigned" />
                <button className="icon-btn sm" title="Unlink from meeting" onClick={(e) => { e.stopPropagation(); unlink(t.id); }}><Unlink size={13} /></button>
              </span>
            </div>
          );
        })}
        <div className="list-row" style={{ cursor: 'default', gap: 8 }}>
          <Plus size={15} className="faint" />
          <input className="bare-input grow" placeholder="Add an action item — creates a ticket (Enter)" value={newItem.title}
            onChange={(e) => setNewItem((x) => ({ ...x, title: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
          <span style={{ width: 130 }}><DateField value={newItem.due_date} onChange={(due_date) => setNewItem((x) => ({ ...x, due_date }))} /></span>
          <UserPicker people={people} value={newItem.assignee_id} onChange={(assignee_id) => setNewItem((x) => ({ ...x, assignee_id }))} className="cell-btn" empty="Assign" />
          <button className="btn sm primary" disabled={!newItem.title.trim()} onClick={addItem}>Add</button>
        </div>
      </div>
    </Peek>
  );
}
