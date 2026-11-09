import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CalendarDays, List, Clock, CalendarCheck, MapPin, Tag as TagIcon, CircleDot, User, Trash2, MoreHorizontal } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { Peek, TitleInput, Prop, MarkdownField, DateField, Person, Tag, Menu, useAnchor, InlineInput, Modal, SearchInput, Empty, ProjectIcon } from '../ui';
import { OptionPicker, UserPicker, useProjectPeople } from '../fields';
import MonthCalendar from '../MonthCalendar';
import { EVENT_STATUSES, EVENT_CATEGORIES, fmtDate, fmtTime, todayISO, parseLocal, MONTHS } from '../lib';

const statusColor = (s) => EVENT_STATUSES.find((x) => x.value === s)?.color || 'gray';

export default function Events({ project }) {
  const { version, userMap, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [view, setView] = useState('list');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const people = useProjectPeople(project);
  const openId = params.get('e');

  const load = useCallback(() => api.get(`/projects/${project.id}/events`).then(setEvents), [project.id]);
  useEffect(() => { load(); }, [load, version]);
  const open = (id) => { const p = new URLSearchParams(params); p.set('e', id); setParams(p); };
  const close = () => { const p = new URLSearchParams(params); p.delete('e'); setParams(p, { replace: true }); load(); };

  const { upcoming, past } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (events || []).filter((e) => !s || [e.title, e.location, e.description, e.category].some((v) => (v || '').toLowerCase().includes(s)));
    const t = todayISO();
    return {
      upcoming: list.filter((e) => (e.end || e.start).slice(0, 10) >= t),
      past: list.filter((e) => (e.end || e.start).slice(0, 10) < t).reverse(),
    };
  }, [events, q]);

  if (!events) return <div className="empty-state">Loading…</div>;
  const row = (e) => {
    const d = parseLocal(e.start);
    return (
      <button key={e.id} className="list-row" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)', padding: '10px 14px' }} onClick={() => open(e.id)}>
        <div style={{ width: 44, textAlign: 'center', flex: 'none' }}>
          <div className="small faint" style={{ textTransform: 'uppercase', fontWeight: 600 }}>{MONTHS[d.getMonth()]}</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
        </div>
        <div className="main-t">
          <div style={{ fontWeight: 500, textDecoration: e.status === 'Cancelled' ? 'line-through' : 'none' }} className="ellipsis">{e.title}</div>
          <div className="sub flex" style={{ gap: 6 }}>
            {fmtTime(e.start) && <span>{fmtTime(e.start)}</span>}
            {e.end && e.end.slice(0, 10) !== e.start.slice(0, 10) && <span>→ {fmtDate(e.end)}</span>}
            {e.location && <span className="flex ellipsis" style={{ gap: 3 }}><MapPin size={12} /> {e.location}</span>}
          </div>
        </div>
        <div className="right">
          <Tag color="gray">{e.category}</Tag>
          <Person user={userMap[e.owner_id]} empty="" />
          <Tag color={statusColor(e.status)} dot status>{e.status}</Tag>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={14} /> List</button>
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}><CalendarDays size={14} /> Calendar</button>
        </div>
        <span className="spacer" />
        {view === 'list' && <SearchInput value={q} onChange={setQ} placeholder="Search events" />}
        <button className="btn primary" onClick={() => setCreating({})}><Plus size={15} /> New event</button>
      </div>
      {view === 'calendar' ? (
        <MonthCalendar
          month={month}
          setMonth={setMonth}
          onDayClick={(iso) => setCreating({ start: `${iso}T10:00` })}
          right={<span className="faint small">Double-click a day to add an event</span>}
          items={events.map((e) => ({ key: e.id, date: e.start, end: e.end, title: e.title, color: statusColor(e.status) === 'gray' ? 'blue' : statusColor(e.status), done: e.status === 'Cancelled', onClick: () => open(e.id) }))}
        />
      ) : !events.length ? (
        <Empty icon="🎪" title="No events yet" text="Track launches, open houses, workshops — where and when they happen." action={<button className="btn primary" onClick={() => setCreating({})}><Plus size={15} /> New event</button>} />
      ) : (
        <>
          <div className="section-title">Upcoming <span className="muted">{upcoming.length}</span></div>
          {upcoming.length ? <div className="panel">{upcoming.map(row)}</div> : <div className="faint small">No upcoming events.</div>}
          {past.length > 0 && (<><div className="section-title">Past <span className="muted">{past.length}</span></div><div className="panel">{past.map(row)}</div></>)}
        </>
      )}
      {creating && <NewEventModal project={project} people={people} defaults={creating} onClose={() => setCreating(null)} onCreated={(e) => { setCreating(null); load(); toast('Event created'); open(e.id); }} />}
      {openId && <EventPanel key={openId} id={openId} project={project} people={people} onClose={close} />}
    </>
  );
}

function NewEventModal({ project, people, defaults, onClose, onCreated }) {
  const { me, toast } = useApp();
  const [d, setD] = useState({ title: '', start: `${todayISO()}T10:00`, end: null, location: '', category: 'General', status: 'Planned', owner_id: me.id, description: '', ...defaults });
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const submit = async () => {
    if (!d.title.trim()) return toast('Event title is required', 'error');
    if (!d.start) return toast('Event date is required', 'error');
    try { onCreated(await api.post(`/projects/${project.id}/events`, d)); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="New event" onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Create event</button></>}>
      <input className="title-input" style={{ fontSize: 24 }} autoFocus placeholder="Event name" value={d.title} onChange={set('title')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <div className="props">
        <Prop icon={<Clock size={15} />} label="Starts" static><DateField withTime value={d.start} onChange={set('start')} /></Prop>
        <Prop icon={<CalendarCheck size={15} />} label="Ends" static><DateField withTime value={d.end} onChange={set('end')} /></Prop>
        <Prop icon={<MapPin size={15} />} label="Where" static><input className="bare-input" placeholder="Venue, address or link" value={d.location} onChange={set('location')} /></Prop>
        <Prop icon={<TagIcon size={15} />} label="Category" static><OptionPicker options={EVENT_CATEGORIES} value={d.category} onChange={set('category')} className="cell-btn" /></Prop>
        <Prop icon={<CircleDot size={15} />} label="Status" static><OptionPicker options={EVENT_STATUSES} value={d.status} onChange={set('status')} className="cell-btn" /></Prop>
        <Prop icon={<User size={15} />} label="Owner" static><UserPicker people={people} value={d.owner_id} onChange={set('owner_id')} className="cell-btn" /></Prop>
      </div>
      <textarea className="textarea" rows={4} placeholder="Details, logistics, what to bring…" value={d.description} onChange={set('description')} />
    </Modal>
  );
}

function EventPanel({ id, project, people, onClose }) {
  const { toast, confirm } = useApp();
  const [e, setE] = useState(null);
  const [menu, openMenu, closeMenu] = useAnchor();
  useEffect(() => {
    api.get(`/projects/${project.id}/events`).then((list) => setE(list.find((x) => String(x.id) === String(id)) || 'missing'));
  }, [id, project.id]);
  const save = async (patch) => {
    setE((x) => ({ ...x, ...patch }));
    try { await api.patch(`/events/${id}`, patch); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete event?', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/events/${id}`);
    toast('Event deleted');
    onClose();
  };
  if (!e) return <Peek onClose={onClose}><div className="empty-state">Loading…</div></Peek>;
  if (e === 'missing') return <Peek onClose={onClose}><div className="empty-state">This event no longer exists.</div></Peek>;
  return (
    <Peek onClose={onClose} head={<span><ProjectIcon project={project} /> {project.name} / Events</span>}>
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        <button className="icon-btn" onClick={openMenu}><MoreHorizontal size={18} /></button>
        <Menu anchor={menu} onClose={closeMenu} align="right" items={[{ label: 'Delete event', icon: <Trash2 size={15} />, danger: true, onClick: remove }]} />
      </div>
      <TitleInput value={e.title} onSave={(title) => save({ title })} />
      <div className="props">
        <Prop icon={<Clock size={15} />} label="Starts" static><DateField withTime value={e.start} onChange={(start) => start && save({ start })} /></Prop>
        <Prop icon={<CalendarCheck size={15} />} label="Ends" static><DateField withTime value={e.end} onChange={(end) => save({ end })} /></Prop>
        <Prop icon={<MapPin size={15} />} label="Where" static>
          <span className="flex grow">
            <InlineInput value={e.location} onSave={(location) => save({ location })} placeholder="Venue, address or link" />
            {e.location && <a className="btn ghost sm" target="_blank" rel="noreferrer" href={/^https?:\/\//.test(e.location) ? e.location : `https://maps.google.com/?q=${encodeURIComponent(e.location)}`}>{/^https?:\/\//.test(e.location) ? 'Open' : 'Map'}</a>}
          </span>
        </Prop>
        <Prop icon={<TagIcon size={15} />} label="Category" static><OptionPicker options={EVENT_CATEGORIES} value={e.category} onChange={(category) => save({ category })} className="cell-btn" /></Prop>
        <Prop icon={<CircleDot size={15} />} label="Status" static><OptionPicker options={EVENT_STATUSES} value={e.status} onChange={(status) => save({ status })} className="cell-btn" /></Prop>
        <Prop icon={<User size={15} />} label="Owner" static><UserPicker people={people} value={e.owner_id} onChange={(owner_id) => save({ owner_id })} className="cell-btn" /></Prop>
      </div>
      <div className="divider" />
      <MarkdownField value={e.description} onSave={(description) => save({ description })} placeholder="Details, logistics, agenda, budget, what to bring…" />
    </Peek>
  );
}
