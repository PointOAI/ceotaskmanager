import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Building2, Briefcase, CircleDot, Mail, Phone, User, Trash2, MoreHorizontal, BellRing, Pencil, Users, ScrollText,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { Peek, TitleInput, Prop, MarkdownField, DateField, Person, Tag, Menu, useAnchor, InlineInput, Modal, SearchInput, Empty, Checkbox, Markdown, Avatar, ProjectIcon } from '../ui';
import { OptionPicker, UserPicker, useProjectPeople } from '../fields';
import { CONTACT_STAGES, CHANNELS, fmtDate, todayISO, isOverdue, addDays } from '../lib';

const stageColor = (s) => CONTACT_STAGES.find((x) => x.value === s)?.color || 'gray';
const channelColor = { Call: 'blue', Email: 'purple', Meeting: 'green', 'Text / WhatsApp': 'yellow', 'Video call': 'orange', 'In person': 'pink', Other: 'gray' };

export default function Communication({ project }) {
  const { version, userMap, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [contacts, setContacts] = useState(null);
  const [comms, setComms] = useState([]);
  const [view, setView] = useState('contacts');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(null);
  const [creating, setCreating] = useState(false);
  const people = useProjectPeople(project);
  const openId = params.get('c');

  const load = useCallback(() => Promise.all([
    api.get(`/projects/${project.id}/contacts`).then(setContacts),
    api.get(`/projects/${project.id}/communications`).then(setComms),
  ]), [project.id]);
  useEffect(() => { load(); }, [load, version]);

  const open = (id) => { const p = new URLSearchParams(params); p.set('c', id); setParams(p); };
  const close = () => { const p = new URLSearchParams(params); p.delete('c'); setParams(p, { replace: true }); load(); };

  const followups = useMemo(
    () => comms.filter((c) => c.next_date && !c.next_done).sort((a, b) => a.next_date.localeCompare(b.next_date)),
    [comms]
  );
  const markDone = async (c) => {
    setComms((all) => all.map((x) => (x.id === c.id ? { ...x, next_done: 1 } : x)));
    await api.patch(`/communications/${c.id}`, { next_done: true });
    toast('Follow-up marked done');
    load();
  };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (contacts || []).filter((c) =>
      (!stage || c.stage === stage) &&
      (!s || [c.name, c.email, c.phone, c.company, c.role].some((v) => (v || '').toLowerCase().includes(s)))
    );
  }, [contacts, q, stage]);
  const filteredComms = useMemo(() => {
    const s = q.trim().toLowerCase();
    return comms.filter((c) => !s || [c.contact_name, c.summary, c.outcome, c.contact_company].some((v) => (v || '').toLowerCase().includes(s)));
  }, [comms, q]);

  if (!contacts) return <div className="empty-state">Loading…</div>;
  const t = todayISO();
  return (
    <>
      {followups.length > 0 && (
        <div className="panel" style={{ margin: '14px 0 4px' }}>
          <div className="panel-head"><BellRing size={15} /> Follow-ups <span className="muted">{followups.length} open</span></div>
          <div className="panel-body">
            {followups.slice(0, 6).map((c) => {
              const late = c.next_date.slice(0, 10) < t;
              const soon = !late && c.next_date.slice(0, 10) <= addDays(t, 2);
              return (
                <div key={c.id} className="list-row" onClick={() => open(c.contact_id)}>
                  <Checkbox checked={false} onChange={() => markDone(c)} />
                  <div className="main-t">
                    <span style={{ fontWeight: 500 }}>{c.contact_name}</span>
                    <span className="muted"> — {c.next_action || 'Follow up'}</span>
                  </div>
                  <span className="right"><Tag color={late ? 'red' : soon ? 'yellow' : 'gray'}>{late ? 'Overdue · ' : ''}{fmtDate(c.next_date)}</Tag></span>
                </div>
              );
            })}
            {followups.length > 6 && <div className="faint small" style={{ padding: '4px 8px' }}>+{followups.length - 6} more — see contacts below</div>}
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="seg">
          <button className={view === 'contacts' ? 'on' : ''} onClick={() => setView('contacts')}><Users size={14} /> Contacts</button>
          <button className={view === 'log' ? 'on' : ''} onClick={() => setView('log')}><ScrollText size={14} /> Communication log</button>
        </div>
        <span className="spacer" />
        <SearchInput value={q} onChange={setQ} placeholder="Search people, notes…" />
        {view === 'contacts' && (
          <>
            <StageFilter stage={stage} setStage={setStage} />
          </>
        )}
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New contact</button>
      </div>

      {view === 'contacts' ? (
        !contacts.length ? (
          <Empty icon="📇" title="No contacts yet" text="Add the people you talk to for this project and keep a log of every conversation." action={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New contact</button>} />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}><span className="th"><span className="faint">Aa</span> Name</span></th>
                  <th><span className="th"><Building2 size={13} /> Company</span></th>
                  <th><span className="th"><Briefcase size={13} /> Role</span></th>
                  <th><span className="th"><CircleDot size={13} /> Stage</span></th>
                  <th><span className="th"><Mail size={13} /> Email</span></th>
                  <th><span className="th"><Phone size={13} /> Phone</span></th>
                  <th><span className="th"><User size={13} /> Owner</span></th>
                  <th>Last contacted</th>
                  <th>Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => open(c.id)}>
                    <td className="title-cell"><span className="flex"><Avatar user={{ display_name: c.name, color: stageColor(c.stage) }} /> <span className="ellipsis">{c.name}</span>{c.comm_count > 0 && <span className="faint small">{c.comm_count}</span>}</span></td>
                    <td><span className="ellipsis">{c.company}</span></td>
                    <td><span className="ellipsis muted">{c.role}</span></td>
                    <td><Tag color={stageColor(c.stage)}>{c.stage}</Tag></td>
                    <td>{c.email && <a className="ellipsis" style={{ textDecoration: 'underline', textDecorationColor: 'var(--text-3)' }} href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.phone && <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>{c.phone}</a>}</td>
                    <td><Person user={userMap[c.owner_id]} empty="" /></td>
                    <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{c.last_contacted ? fmtDate(c.last_contacted) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.next_followup ? <Tag color={isOverdue(c.next_followup) ? 'red' : 'yellow'}>{fmtDate(c.next_followup)}</Tag> : <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="tbl-add" onClick={() => setCreating(true)}><Plus size={14} /> New</button>
          </div>
        )
      ) : (
        <div style={{ maxWidth: 820, marginTop: 10 }}>
          {!filteredComms.length && <div className="empty-state">No communication logged yet. Open a contact to log a call, email or meeting.</div>}
          <div className="timeline">
            {filteredComms.map((c) => (
              <div key={c.id} className={`tl-item c-${channelColor[c.channel] || 'gray'}`}>
                <div className="tl-head">
                  <b style={{ color: 'var(--text)', cursor: 'pointer' }} onClick={() => open(c.contact_id)}>{c.contact_name}</b>
                  {c.contact_company && <span>· {c.contact_company}</span>}
                  <Tag color={channelColor[c.channel] || 'gray'}>{c.channel}</Tag>
                  <span>{fmtDate(c.date)}</span>
                  <span className="faint">by {userMap[c.created_by]?.display_name || '—'}</span>
                </div>
                <div className="tl-card">
                  {c.summary ? <Markdown text={c.summary} /> : <span className="faint">No notes</span>}
                  {c.outcome && <><div className="lbl">Outcome</div><Markdown text={c.outcome} /></>}
                  {c.next_date && (
                    <div className={`followup-box${c.next_done ? ' done' : ''}`}>
                      <BellRing size={13} /> Next: {fmtDate(c.next_date)}{c.next_action ? ` — ${c.next_action}` : ''}{c.next_done ? ' ✓' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && <NewContactModal project={project} people={people} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); load(); open(c.id); }} />}
      {openId && <ContactPanel key={openId} id={openId} project={project} people={people} onClose={close} />}
    </>
  );
}

function StageFilter({ stage, setStage }) {
  const [a, open, close] = useAnchor();
  return (
    <>
      <button className={`chip-btn${stage ? ' on' : ''}`} onClick={open}>Stage{stage ? ` · ${stage}` : ''}</button>
      <Menu anchor={a} onClose={close} items={[
        { label: 'All stages', onClick: () => setStage(null), checked: !stage },
        ...CONTACT_STAGES.map((s) => ({ label: s.value, onClick: () => setStage(s.value), checked: stage === s.value })),
      ]} />
    </>
  );
}

function NewContactModal({ project, people, onClose, onCreated }) {
  const { me, toast } = useApp();
  const [d, setD] = useState({ name: '', email: '', phone: '', company: '', role: '', stage: 'Lead', owner_id: me.id, notes: '' });
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const submit = async () => {
    if (!d.name.trim()) return toast('Name is required', 'error');
    try { onCreated(await api.post(`/projects/${project.id}/contacts`, d)); toast('Contact added'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="New contact" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Add contact</button></>}>
      <div className="field"><label>Full name *</label><input className="input" autoFocus value={d.name} onChange={set('name')} /></div>
      <div className="row">
        <div className="field"><label>Email</label><input className="input" type="email" value={d.email} onChange={set('email')} /></div>
        <div className="field"><label>Phone</label><input className="input" value={d.phone} onChange={set('phone')} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Company / organization</label><input className="input" value={d.company} onChange={set('company')} /></div>
        <div className="field"><label>Role / title</label><input className="input" value={d.role} onChange={set('role')} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Stage</label><select className="select" value={d.stage} onChange={set('stage')}>{CONTACT_STAGES.map((s) => <option key={s.value}>{s.value}</option>)}</select></div>
        <div className="field"><label>Owner</label><select className="select" value={d.owner_id || ''} onChange={(e) => setD((x) => ({ ...x, owner_id: Number(e.target.value) || null }))}>{people.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select></div>
      </div>
      <div className="field"><label>Notes</label><textarea className="textarea" rows={3} value={d.notes} onChange={set('notes')} placeholder="How you met, what they care about…" /></div>
    </Modal>
  );
}

function ContactPanel({ id, project, people, onClose }) {
  const { userMap, toast, confirm, me } = useApp();
  const [c, setC] = useState(null);
  const [menu, openMenu, closeMenu] = useAnchor();
  const [editing, setEditing] = useState(null); // communication being edited or {} for new
  const load = useCallback(() => api.get(`/contacts/${id}`).then(setC).catch((e) => toast(e.message, 'error')), [id, toast]);
  useEffect(() => { load(); }, [load]);
  const save = async (patch) => {
    setC((x) => ({ ...x, ...patch }));
    try { await api.patch(`/contacts/${id}`, patch); } catch (e) { toast(e.message, 'error'); load(); }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${c.name}?`, message: 'The contact and their whole communication log will be deleted.', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/contacts/${id}`);
    toast('Contact deleted');
    onClose();
  };
  const toggleDone = async (m) => { await api.patch(`/communications/${m.id}`, { next_done: !m.next_done }); load(); };
  const delComm = async (m) => {
    if (!(await confirm({ title: 'Delete this log entry?', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/communications/${m.id}`);
    load();
  };
  if (!c) return <Peek onClose={onClose}><div className="empty-state">Loading…</div></Peek>;
  return (
    <Peek onClose={onClose} wide head={<span><ProjectIcon project={project} /> {project.name} / Communication</span>}>
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        <button className="icon-btn" onClick={openMenu}><MoreHorizontal size={18} /></button>
        <Menu anchor={menu} onClose={closeMenu} align="right" items={[{ label: 'Delete contact', icon: <Trash2 size={15} />, danger: true, onClick: remove }]} />
      </div>
      <TitleInput value={c.name} onSave={(name) => save({ name })} />
      <div className="props">
        <Prop icon={<Building2 size={15} />} label="Company" static><InlineInput value={c.company} onSave={(company) => save({ company })} /></Prop>
        <Prop icon={<Briefcase size={15} />} label="Role" static><InlineInput value={c.role} onSave={(role) => save({ role })} /></Prop>
        <Prop icon={<CircleDot size={15} />} label="Stage" static><OptionPicker options={CONTACT_STAGES} value={c.stage} onChange={(stage) => save({ stage })} className="cell-btn" /></Prop>
        <Prop icon={<Mail size={15} />} label="Email" static>
          <span className="flex grow"><InlineInput type="email" value={c.email} onSave={(email) => save({ email })} />{c.email && <a className="btn ghost sm" href={`mailto:${c.email}`}>Email</a>}</span>
        </Prop>
        <Prop icon={<Phone size={15} />} label="Phone" static>
          <span className="flex grow"><InlineInput value={c.phone} onSave={(phone) => save({ phone })} />{c.phone && <a className="btn ghost sm" href={`tel:${c.phone}`}>Call</a>}</span>
        </Prop>
        <Prop icon={<User size={15} />} label="Owner" static><UserPicker people={people} value={c.owner_id} onChange={(owner_id) => save({ owner_id })} className="cell-btn" /></Prop>
      </div>
      <div className="section-title">Notes</div>
      <MarkdownField value={c.notes} onSave={(notes) => save({ notes })} placeholder="Background, preferences, how you met…" minHeight={60} />

      <div className="section-title">
        Communication log <span className="muted">{c.communications.length}</span>
        <span style={{ marginLeft: 'auto' }}><button className="btn sm primary" onClick={() => setEditing({})}><Plus size={13} /> Log communication</button></span>
      </div>
      {editing && <CommForm contact={c} initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {!c.communications.length && !editing && <div className="empty-state">No conversations logged yet.</div>}
      <div className="timeline" style={{ marginTop: 8 }}>
        {c.communications.map((m) => (
          <div key={m.id} className={`tl-item c-${channelColor[m.channel] || 'gray'}`}>
            <div className="tl-head">
              <Tag color={channelColor[m.channel] || 'gray'}>{m.channel}</Tag>
              <b style={{ color: 'var(--text)' }}>{fmtDate(m.date, { relative: false })}</b>
              <span className="faint">logged by {userMap[m.created_by]?.display_name || '—'}</span>
              {(m.created_by === me.id || me.role === 'admin') && (
                <span style={{ marginLeft: 'auto' }} className="flex">
                  <button className="icon-btn sm" onClick={() => setEditing(m)}><Pencil size={12} /></button>
                  <button className="icon-btn sm" onClick={() => delComm(m)}><Trash2 size={12} /></button>
                </span>
              )}
            </div>
            <div className="tl-card">
              <div className="lbl">What happened</div>
              {m.summary ? <Markdown text={m.summary} /> : <span className="faint">—</span>}
              {m.outcome && <><div className="lbl">Outcome / next steps</div><Markdown text={m.outcome} /></>}
              {m.next_date && (
                <div className={`followup-box${m.next_done ? ' done' : ''}`}>
                  <Checkbox checked={!!m.next_done} onChange={() => toggleDone(m)} size={15} />
                  Next communication: <b>{fmtDate(m.next_date, { relative: false })}</b>{m.next_action ? ` — ${m.next_action}` : ''}
                  {!m.next_done && isOverdue(m.next_date) && <Tag color="red">Overdue</Tag>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Peek>
  );
}

function CommForm({ contact, initial, onCancel, onSaved }) {
  const { toast } = useApp();
  const isEdit = !!initial.id;
  const [d, setD] = useState({
    date: initial.date || todayISO(), channel: initial.channel || 'Call', summary: initial.summary || '', outcome: initial.outcome || '',
    next_date: initial.next_date || null, next_action: initial.next_action || '',
  });
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const submit = async () => {
    try {
      if (isEdit) await api.patch(`/communications/${initial.id}`, d);
      else await api.post(`/contacts/${contact.id}/communications`, d);
      toast(isEdit ? 'Log updated' : 'Communication logged');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="panel" style={{ padding: 14, marginBottom: 12, background: 'var(--bg-soft)' }}>
      <div className="row">
        <div className="field"><label>Date *</label><input className="input" type="date" value={d.date} onChange={set('date')} /></div>
        <div className="field"><label>Channel</label><select className="select" value={d.channel} onChange={set('channel')}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="field"><label>What happened in this communication?</label><textarea className="textarea" autoFocus rows={3} value={d.summary} onChange={set('summary')} placeholder="Topics discussed, questions they asked, their mood…" /></div>
      <div className="field"><label>Outcome / agreed next steps</label><textarea className="textarea" rows={2} style={{ minHeight: 56 }} value={d.outcome} onChange={set('outcome')} /></div>
      <div className="row">
        <div className="field"><label>Next communication date (optional)</label><input className="input" type="date" value={d.next_date || ''} onChange={(e) => setD((x) => ({ ...x, next_date: e.target.value || null }))} /></div>
        <div className="field"><label>Next action</label><input className="input" value={d.next_action} onChange={set('next_action')} placeholder="e.g. Send proposal" /></div>
      </div>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={submit}>{isEdit ? 'Save changes' : 'Save log'}</button>
      </div>
    </div>
  );
}
