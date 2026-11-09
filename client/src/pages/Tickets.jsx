import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, KanbanSquare, List, MoreHorizontal, Pencil, Trash2, ArrowLeft, ArrowRight, CheckCircle2, Calendar,
  MessageSquare, ListChecks, User, ArrowUpDown, ChevronUp, ChevronDown, Link2, Flag, Tags, CircleDot, Hash, Palette,
  AlertTriangle, Hand, ArrowRightLeft, Check, Paperclip, ListTree, CornerDownRight, Archive, ArchiveRestore, History,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { Avatar, Tag, Menu, Modal, SelectMenu, StatusTag, useAnchor, SearchInput, Person, DateField, AutoTextarea, Empty, PriorityIcon, PriorityLabel, useIsMobile, TaskIcon, TicketTypeIcon, ProjectIcon } from '../ui';
import { StatusPicker, PriorityPicker, UserPicker, TagsPicker, useProjectPeople } from '../fields';
import { COLORS, PRIORITIES, PRIORITY_RANK, fmtDate, isOverdue, tagColor, timeAgo, parseServer, toISODate } from '../lib';

export default function Tickets({ project, reloadProject }) {
  const { me, version, openTicket, toast, bump } = useApp();
  const [tickets, setTickets] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(`tmc-view-${project.id}`) || 'board');
  const [q, setQ] = useState('');
  const [fAssignee, setFAssignee] = useState([]);
  const [fPriority, setFPriority] = useState([]);
  const [fTags, setFTags] = useState([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showNew, setShowNew] = useState(null);
  const [aA, openA, closeA] = useAnchor();
  const [aP, openP, closeP] = useAnchor();
  const [aT, openT, closeT] = useAnchor();
  const people = useProjectPeople(project);

  const load = () => api.get(`/projects/${project.id}/tickets`).then(setTickets);
  useEffect(() => { load(); }, [project.id, version]); // eslint-disable-line
  const setV = (v) => { setView(v); try { localStorage.setItem(`tmc-view-${project.id}`, v); } catch {} };

  const allTags = useMemo(() => [...new Set((tickets || []).flatMap((t) => t.tags))].sort(), [tickets]);
  const filtered = useMemo(() => {
    if (!tickets) return [];
    const s = q.trim().toLowerCase();
    return tickets.filter((t) =>
      (!s || t.title.toLowerCase().includes(s) || t.key.toLowerCase().includes(s) || (t.body || '').toLowerCase().includes(s)) &&
      (!onlyMine || t.assignee_id === me.id) &&
      (!fAssignee.length || fAssignee.includes(t.assignee_id ?? 0)) &&
      (!fPriority.length || fPriority.includes(t.priority)) &&
      (!fTags.length || fTags.some((g) => t.tags.includes(g)))
    );
  }, [tickets, q, onlyMine, fAssignee, fPriority, fTags, me.id]);

  const doneIds = useMemo(() => new Set(project.statuses.filter((s) => s.is_done).map((s) => s.id)), [project.statuses]);
  const summary = useMemo(() => {
    const all = tickets || [];
    const open = all.filter((t) => !doneIds.has(t.status_id));
    return {
      total: all.length,
      open: open.length,
      overdue: open.filter((t) => isOverdue(t.due_date)).length,
      done: all.length - open.length,
      mine: open.filter((t) => t.assignee_id === me.id).length,
    };
  }, [tickets, doneIds, me.id]);

  const update = async (t, patch) => {
    setTickets((all) => all.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    try {
      const u = await api.patch(`/tickets/${t.id}`, patch);
      setTickets((all) => all.map((x) => (x.id === t.id ? u : x)));
      if ('status_id' in patch) reloadProject();
    } catch (e) { toast(e.message, 'error'); load(); }
  };
  const create = async (data) => {
    const t = await api.post(`/projects/${project.id}/tickets`, data);
    setTickets((all) => [...all, t]);
    reloadProject();
    return t;
  };
  // History: done tickets leave the board but keep everything; Undo / Restore brings them back.
  const restore = async (ids) => {
    try {
      await Promise.all(ids.map((id) => api.post(`/tickets/${id}/restore`)));
      load();
      bump();
    } catch (e) { toast(e.message, 'error'); }
  };
  const archive = async (t) => {
    setTickets((all) => all.filter((x) => x.id !== t.id));
    try {
      await api.post(`/tickets/${t.id}/archive`);
      bump();
      toast(`${t.key} moved to history`, 'info', { label: 'Undo', onClick: () => restore([t.id]) });
    } catch (e) { toast(e.message, 'error'); load(); }
  };
  const archiveColumn = async (status) => {
    try {
      const { ids } = await api.post(`/projects/${project.id}/archive-done`, { status_id: status.id });
      setTickets((all) => all.filter((x) => !ids.includes(x.id)));
      bump();
      toast(`${ids.length} ticket${ids.length === 1 ? '' : 's'} moved to history`, 'info', { label: 'Undo', onClick: () => restore(ids) });
    } catch (e) { toast(e.message, 'error'); }
  };
  const filtersOn = fAssignee.length + fPriority.length + fTags.length + (onlyMine ? 1 : 0) + (q.trim() ? 1 : 0);
  const clearFilters = () => { setFAssignee([]); setFPriority([]); setFTags([]); setOnlyMine(false); setQ(''); };

  return (
    <div className="tickets">
      <div className="tickets-bar">
        <SearchInput value={q} onChange={setQ} placeholder="Search tickets" />
        <AvatarFilter people={people} value={fAssignee} onChange={setFAssignee} />
        <div className="filter-chips">
          <button className={`chip-btn${onlyMine ? ' on' : ''}`} onClick={() => setOnlyMine(!onlyMine)} aria-pressed={onlyMine}>
            Only my tickets
          </button>
          <button className={`chip-btn${fAssignee.length ? ' on' : ''}`} onClick={openA}>
            Assignee{fAssignee.length ? ` · ${fAssignee.length}` : ''} <ChevronDown size={14} />
          </button>
          <button className={`chip-btn${fPriority.length ? ' on' : ''}`} onClick={openP}>
            Priority{fPriority.length ? ` · ${fPriority.length}` : ''} <ChevronDown size={14} />
          </button>
          <button className={`chip-btn${fTags.length ? ' on' : ''}`} onClick={openT} disabled={!allTags.length && !fTags.length} title={allTags.length ? '' : 'No labels used yet'}>
            Labels{fTags.length ? ` · ${fTags.length}` : ''} <ChevronDown size={14} />
          </button>
          {filtersOn > 0 && <button className="btn ghost sm clear-btn" onClick={clearFilters}>Clear filters</button>}
        </div>
        <span className="spacer" />
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setV('board')} title="Columns by status — drag cards to move them">
            <KanbanSquare size={15} /> Board
          </button>
          <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setV('table')} title="All tickets in one sortable list">
            <List size={15} /> List
          </button>
          <button role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'on' : ''} onClick={() => setV('history')} title="Done tickets moved off the board — restore them any time">
            <History size={15} /> History
          </button>
        </div>
        <button className="btn primary create-btn" onClick={() => setShowNew({})}><Plus size={16} /> Create<span className="hide-phone">ticket</span></button>
      </div>

      {tickets && tickets.length > 0 && view !== 'history' && (
        <div className="ticket-summary">
          {filtersOn > 0 && <span className="showing">Showing {filtered.length} of {tickets.length}</span>}
          <span><b>{summary.open}</b> open</span>
          {summary.overdue > 0 && <span className="warn"><AlertTriangle size={13} /> <b>{summary.overdue}</b> overdue</span>}
          <span><b>{summary.done}</b> done</span>
          {summary.mine > 0 && !onlyMine && <button className="linkish" onClick={() => setOnlyMine(true)}><b>{summary.mine}</b> assigned to you</button>}
        </div>
      )}

      <SelectMenu anchor={aA} onClose={closeA} multi value={fAssignee} onChange={setFAssignee}
        options={[{ value: 0, label: 'Unassigned', render: <span className="faint">Unassigned</span> }, ...people.map((u) => ({ value: u.id, label: u.display_name, render: <Person user={u} /> }))]} />
      <SelectMenu anchor={aP} onClose={closeP} multi searchable={false} value={fPriority} onChange={setFPriority}
        options={PRIORITIES.map((p) => ({ value: p.value, label: p.value, render: <PriorityLabel value={p.value} /> }))} />
      <SelectMenu anchor={aT} onClose={closeT} multi value={fTags} onChange={setFTags}
        options={allTags.map((t) => ({ value: t, label: t, render: <Tag color={tagColor(t)}>{t}</Tag> }))} />

      {view === 'history' ? (
        <HistoryView project={project} q={q} openTicket={openTicket} onRestore={restore} />
      ) : !tickets ? (
        <div className="empty-state">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <Empty
          icon="🎫"
          title="No tickets yet"
          text="Tickets are the tasks for this project. Create one, give it an owner and a due date, and track it from To Do to Done."
          action={<button className="btn primary lg" onClick={() => setShowNew({})}><Plus size={16} /> Create the first ticket</button>}
        />
      ) : filtered.length === 0 ? (
        <Empty icon="🔍" title="No tickets match these filters" text="Try a different search, or clear the filters to see everything." action={<button className="btn" onClick={clearFilters}>Clear filters</button>} />
      ) : view === 'board' ? (
        <Board project={project} tickets={filtered} update={update} create={create} reloadProject={reloadProject} openTicket={openTicket} bump={bump} archive={archive} archiveColumn={archiveColumn} />
      ) : (
        <TicketTable project={project} tickets={filtered} update={update} openTicket={openTicket} people={people} allTags={allTags} onNew={() => setShowNew({})} />
      )}
      {showNew && <NewTicketModal project={project} people={people} allTags={allTags} defaults={showNew} onClose={() => setShowNew(null)} onCreate={async (d) => { const t = await create(d); toast(`${t.key} created`); }} />}
    </div>
  );
}

/** Jira-style quick filter: click a face to show only their tickets. */
function AvatarFilter({ people, value, onChange }) {
  if (!people.length) return null;
  const shown = people.slice(0, 5);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="avatar-filter" role="group" aria-label="Filter by assignee">
      {shown.map((u) => (
        <button key={u.id} className={value.includes(u.id) ? 'on' : ''} onClick={() => toggle(u.id)} aria-pressed={value.includes(u.id)} title={`Show tickets assigned to ${u.display_name}`}>
          <Avatar user={u} size="lg" />
        </button>
      ))}
      {people.length > shown.length && <span className="more" title={`${people.length - shown.length} more people — use the Assignee filter`}>+{people.length - shown.length}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- board */
function Board({ project, tickets, update, create, reloadProject, openTicket, archive, archiveColumn }) {
  const { toast, confirm } = useApp();
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { status, index }
  const [newCol, setNewCol] = useState(false);
  const [colName, setColName] = useState('');
  const statuses = project.statuses;
  const people = useProjectPeople(project);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(statuses.map((s) => [s.id, []]));
    tickets.forEach((t) => { (m[t.status_id] || m[statuses[0]?.id])?.push(t); });
    Object.values(m).forEach((l) => l.sort((a, b) => a.position - b.position || a.id - b.id));
    return m;
  }, [tickets, statuses]);

  const onDragOver = (e, statusId) => {
    e.preventDefault();
    const cards = [...e.currentTarget.querySelectorAll('[data-card]')].filter((c) => Number(c.dataset.card) !== dragId);
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    if (!over || over.status !== statusId || over.index !== index) setOver({ status: statusId, index });
  };
  const onDrop = (e, statusId) => {
    e.preventDefault();
    const t = tickets.find((x) => x.id === dragId);
    const target = over?.status === statusId ? over.index : byStatus[statusId].length;
    setDragId(null);
    setOver(null);
    if (!t) return;
    const list = byStatus[statusId].filter((x) => x.id !== t.id);
    const prev = list[target - 1]?.position;
    const next = list[target]?.position;
    let position;
    if (prev == null && next == null) position = 1024;
    else if (prev == null) position = next - 1024;
    else if (next == null) position = prev + 1024;
    else position = (prev + next) / 2;
    if (t.status_id === statusId && t.position === position) return;
    const patch = { position };
    if (t.status_id !== statusId) patch.status_id = statusId;
    update(t, patch);
  };
  // Used by the card's "Move to" menu (works on touch screens, where drag & drop doesn't).
  const moveTo = (t, statusId) => {
    if (t.status_id === statusId) return;
    const last = byStatus[statusId].at(-1)?.position;
    update(t, { status_id: statusId, position: last == null ? 1024 : last + 1024 });
    toast(`${t.key} moved to ${statuses.find((s) => s.id === statusId)?.name}`);
  };

  const addColumn = async () => {
    if (!colName.trim()) return setNewCol(false);
    try {
      await api.post(`/projects/${project.id}/statuses`, { name: colName.trim(), color: COLORS[(statuses.length + 3) % COLORS.length] });
      setColName('');
      setNewCol(false);
      reloadProject();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className={`board${dragId ? ' is-dragging' : ''}`}>
      {statuses.map((s, i) => {
        const list = byStatus[s.id];
        const visible = list.filter((t) => t.id !== dragId);
        return (
          <section
            key={s.id}
            className={`column${over?.status === s.id ? ' drag-over' : ''}`}
            onDragOver={(e) => onDragOver(e, s.id)}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={(e) => onDrop(e, s.id)}
            aria-label={`${s.name}, ${list.length} tickets`}
          >
            <ColumnHead status={s} index={i} statuses={statuses} count={list.length} project={project} reloadProject={reloadProject} confirm={confirm} toast={toast} />
            <div className="cards">
              {list.map((t, idx) => (
                <div key={t.id}>
                  {over?.status === s.id && over.index === idx && dragId !== t.id && <div className="drop-indicator" />}
                  <Card
                    t={t}
                    statuses={statuses}
                    people={people}
                    onAssign={(assignee_id) => update(t, { assignee_id })}
                    dragging={dragId === t.id}
                    onOpen={() => openTicket(t.id)}
                    onMove={(statusId) => moveTo(t, statusId)}
                    onArchive={() => archive(t)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                  />
                </div>
              ))}
              {over?.status === s.id && over.index >= visible.length && list.length > 0 && <div className="drop-indicator" />}
              {!visible.length && (
                <div className="column-empty">
                  {dragId ? <><Hand size={14} /> Drop here</> : s.is_done ? 'Finished tickets land here' : 'No tickets'}
                </div>
              )}
            </div>
            <InlineNewCard statusId={s.id} create={create} />
            {!!s.is_done && list.length > 0 && (
              <button className="add-card archive-all" onClick={() => archiveColumn(s)} title="Move these finished tickets off the board. You can restore them from History.">
                <Archive size={15} /> Move {list.length === 1 ? 'it' : `all ${list.length}`} to history
              </button>
            )}
          </section>
        );
      })}
      <div className={`add-column${newCol ? ' open' : ''}`}>
        {newCol ? (
          <div className="new-card">
            <input className="bare-input" autoFocus placeholder="Column name, e.g. Review" value={colName}
              onChange={(e) => setColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setNewCol(false); }}
              onBlur={addColumn} />
            <div className="faint small" style={{ marginTop: 4 }}>Enter to add · Esc to cancel</div>
          </div>
        ) : (
          <button className="add-column-btn" onClick={() => setNewCol(true)} title="Add a new status column" aria-label="Add column"><Plus size={18} /><span className="add-col-label">Add column</span></button>
        )}
      </div>
    </div>
  );
}

function ColumnHead({ status, index, statuses, count, project, reloadProject, confirm, toast }) {
  const [menu, openMenu, closeMenu] = useAnchor();
  const [colorMenu, setColorMenu] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(status.name);
  const patch = async (p) => { await api.patch(`/statuses/${status.id}`, p); reloadProject(); };
  const move = async (dir) => {
    const ids = statuses.map((s) => s.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await api.put(`/projects/${project.id}/statuses/order`, { ids });
    reloadProject();
  };
  const del = async () => {
    const target = statuses.find((s) => s.id !== status.id);
    const ok = await confirm({
      title: `Delete “${status.name}” column?`,
      message: count ? `${count} ticket(s) in this column will move to “${target?.name}”.` : 'This column is empty.',
      danger: true, confirmText: 'Delete column',
    });
    if (!ok) return;
    try { await api.del(`/statuses/${status.id}`, { move_to: target?.id }); reloadProject(); } catch (e) { toast(e.message, 'error'); }
  };
  const rename = async () => {
    setRenaming(false);
    if (name.trim() && name !== status.name) await patch({ name: name.trim() });
    else setName(status.name);
  };
  return (
    <div className={`column-head c-${status.color}`}>
      {renaming ? (
        <input className="input" style={{ height: 28, padding: '0 8px' }} autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} />
      ) : (
        <span className="column-name" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
          {status.name}
          <span className="count">{count} {count === 1 ? 'ticket' : 'tickets'}</span>
        </span>
      )}
      {!!status.is_done && <span className="done-flag" title="Tickets here count as done"><Check size={15} strokeWidth={2.6} /></span>}
      <span className="actions">
        <button className="icon-btn sm" onClick={openMenu} title="Column options" aria-label={`${status.name} column options`}><MoreHorizontal size={16} /></button>
      </span>
      <Menu
        anchor={menu}
        onClose={closeMenu}
        items={[
          { label: 'Rename', icon: <Pencil size={14} />, onClick: () => setRenaming(true) },
          { label: 'Change color', icon: <Palette size={14} />, onClick: () => setColorMenu(menu) },
          { label: 'Counts as “done”', icon: <CheckCircle2 size={14} />, checked: !!status.is_done, onClick: () => patch({ is_done: !status.is_done }) },
          index > 0 && { label: 'Move column left', icon: <ArrowLeft size={14} />, onClick: () => move(-1) },
          index < statuses.length - 1 && { label: 'Move column right', icon: <ArrowRight size={14} />, onClick: () => move(1) },
          '-',
          { label: 'Delete column', icon: <Trash2 size={14} />, danger: true, onClick: del },
        ]}
      />
      <SelectMenu
        anchor={colorMenu}
        onClose={() => setColorMenu(null)}
        searchable={false}
        value={status.color}
        onChange={(color) => patch({ color })}
        options={COLORS.map((c) => ({ value: c, label: c, render: <Tag color={c} dot status>{c[0].toUpperCase() + c.slice(1)}</Tag> }))}
      />
    </div>
  );
}

function DueBadge({ date, done }) {
  if (!date) return null;
  const overdue = isOverdue(date) && !done;
  const label = fmtDate(date);
  return (
    <span className={`due-badge${overdue ? ' overdue' : ''}`} title={overdue ? `Overdue — was due ${label}` : `Due ${label}`}>
      {overdue ? <AlertTriangle size={12} /> : <Calendar size={12} />}
      {overdue ? `Overdue · ${label}` : label}
    </span>
  );
}

function Card({ t, statuses, people, onAssign, onOpen, onMove, onArchive, onDragStart, onDragEnd, dragging }) {
  const { userMap } = useApp();
  const [menu, openMenu, closeMenu] = useAnchor();
  const [assignMenu, openAssign, closeAssign] = useAnchor();
  const done = !!t.completed_at || !!statuses.find((s) => s.id === t.status_id)?.is_done;
  const assignee = userMap[t.assignee_id];
  return (
    <article
      className={`card${dragging ? ' dragging' : ''}${done ? ' done' : ''}`}
      data-card={t.id}
      draggable
      tabIndex={0}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}
      aria-label={`${t.key}: ${t.title}`}
    >
      {t.parent && (
        <div className="card-parent" title={`Sub-ticket of ${t.parent.key}: ${t.parent.title}`}>
          <CornerDownRight size={12} /><b>{t.parent.key}</b><span className="ellipsis">{t.parent.title}</span>
        </div>
      )}
      <div className="ttl">{t.title}</div>
      {t.tags.length > 0 && (
        <div className="card-tags">
          {t.tags.slice(0, 3).map((g) => <Tag key={g} color={tagColor(g)}>{g}</Tag>)}
          {t.tags.length > 3 && <span className="faint small">+{t.tags.length - 3}</span>}
        </div>
      )}
      <div className="card-foot">
        <span className="key"><TicketTypeIcon ticket={t} size={16} />{t.key}</span>
        {t.priority && <span className="m" title={`${t.priority} priority`}><PriorityIcon value={t.priority} /></span>}
        <DueBadge date={t.due_date} done={done} />
        {t.checklist_total > 0 && (
          <span className={`m${t.checklist_done === t.checklist_total ? ' all-done' : ''}`} title="Checklist progress">
            <ListChecks size={13} /> {t.checklist_done}/{t.checklist_total}
          </span>
        )}
        {t.subtask_total > 0 && (
          <span className={`m${t.subtask_done === t.subtask_total ? ' all-done' : ''}`} title={`${t.subtask_done} of ${t.subtask_total} sub-tickets done`}>
            <ListTree size={13} /> {t.subtask_done}/{t.subtask_total}
          </span>
        )}
        {t.attachment_count > 0 && <span className="m" title={`${t.attachment_count} attachment(s)`}><Paperclip size={13} /> {t.attachment_count}</span>}
        {t.comment_count > 0 && <span className="m" title={`${t.comment_count} comment(s)`}><MessageSquare size={13} /> {t.comment_count}</span>}
        {t.meeting_id && <span className="m" title={`From meeting: ${t.meeting_title}`}><Link2 size={13} /></span>}
        <button className="icon-btn sm card-move" onClick={openMenu} title="Move to another column" aria-label="Move ticket">
          <ArrowRightLeft size={14} />
        </button>
        <button
          className="card-assignee"
          onClick={(e) => { e.stopPropagation(); openAssign(e); }}
          onKeyDown={(e) => e.stopPropagation()}
          title={assignee ? `Assigned to ${assignee.display_name} — click to change` : 'Unassigned — click to assign'}
          aria-label={assignee ? `Assignee: ${assignee.display_name}. Change assignee` : 'Assign ticket'}
        >
          {assignee ? <Avatar user={assignee} size="md" /> : <span className="avatar md unassigned"><User size={12} /></span>}
        </button>
      </div>
      <SelectMenu
        anchor={assignMenu}
        onClose={closeAssign}
        align="right"
        allowClear={!!t.assignee_id}
        value={t.assignee_id}
        onChange={onAssign}
        placeholder="Assign to…"
        options={people.map((u) => ({ value: u.id, label: u.display_name, render: <Person user={u} /> }))}
      />
      <Menu
        anchor={menu}
        onClose={closeMenu}
        align="right"
        items={[
          { label: 'Move to…' },
          ...statuses.map((s) => ({ label: s.name, icon: <span className={`c-${s.color} status-dot`} />, checked: s.id === t.status_id, onClick: () => onMove(s.id) })),
          ...(done ? ['-', { label: 'Move to history', icon: <Archive size={14} />, onClick: onArchive }] : []),
        ]}
      />
    </article>
  );
}

function InlineNewCard({ statusId, create }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const ref = useRef(null);
  const submit = async () => {
    if (!title.trim()) return setOpen(false);
    try {
      await create({ title: title.trim(), status_id: statusId });
      setTitle('');
      ref.current?.focus();
    } catch (e) { toast(e.message, 'error'); }
  };
  if (!open) return <button className="add-card" onClick={() => setOpen(true)}><Plus size={16} /> Create ticket</button>;
  return (
    <div className="new-card">
      <AutoTextarea
        ref={ref}
        className="bare-input"
        autoFocus
        placeholder="What needs to be done?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
        onBlur={() => { if (!title.trim()) setOpen(false); }}
        style={{ resize: 'none', fontWeight: 500 }}
      />
      <div className="new-card-foot">
        <span className="faint small">Enter to create · Esc to cancel</span>
        <button className="btn primary sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!title.trim()}>Create</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- history */
function HistoryView({ project, q, openTicket, onRestore }) {
  const { userMap, version } = useApp();
  const mobile = useIsMobile();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/projects/${project.id}/tickets?archived=1`).then(setItems).catch(() => setItems([])); }, [project.id, version]);
  const s = q.trim().toLowerCase();
  const list = (items || []).filter((t) => !s || t.title.toLowerCase().includes(s) || t.key.toLowerCase().includes(s));
  const restore = (t) => { setItems((all) => all.filter((x) => x.id !== t.id)); onRestore([t.id]); };
  const statusOf = (t) => project.statuses.find((x) => x.id === t.status_id);
  // completed_at is a UTC server timestamp — show it as the viewer's local date
  const done = (t) => (t.completed_at ? fmtDate(toISODate(parseServer(t.completed_at))) : '—');

  if (!items) return <div className="empty-state">Loading history…</div>;
  return (
    <>
      <p className="history-intro">
        <History size={15} />
        <span>Done tickets that were moved off the board. Comments, files and sub-tickets are all kept — <b>Restore</b> puts a ticket back on the board.</span>
      </p>
      {!items.length ? (
        <Empty icon="🗄️" title="History is empty" text="When a ticket is done, choose “Move to history” on its card or in the ticket to clear it off the board. It will be listed here." />
      ) : !list.length ? (
        <Empty icon="🔍" title="No tickets in history match your search" text="Try a different search." />
      ) : mobile ? (
        <div className="ticket-list">
          {list.map((t) => (
            <div key={t.id} className="ticket-row history-row">
              <button className="tr-main" onClick={() => openTicket(t.id)}>
                <span className="tr-title">{t.title}</span>
                <span className="tr-meta">
                  <span className="key"><TicketTypeIcon ticket={t} size={14} />{t.key}</span>
                  <span>{t.completed_at ? `Done ${done(t)}` : 'Done'}</span>
                </span>
              </button>
              <button className="btn sm" onClick={() => restore(t)}><ArchiveRestore size={14} /> Restore</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th style={{ minWidth: 260 }}>Title</th><th>Status</th><th>Assignee</th><th>Completed</th><th>Moved to history</th><th /></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="key-cell" onClick={() => openTicket(t.id)}><span className="key"><TicketTypeIcon ticket={t} size={16} />{t.key}</span></td>
                  <td className="title-cell" onClick={() => openTicket(t.id)}>
                    {t.parent && <span className="faint small parent-inline" title={t.parent.title}>{t.parent.key} /</span>}
                    <span className="title-link">{t.title}</span>
                  </td>
                  <td>{statusOf(t) ? <StatusTag status={statusOf(t)} /> : <span className="faint">—</span>}</td>
                  <td><Person user={userMap[t.assignee_id]} empty="Unassigned" /></td>
                  <td className="muted">{done(t)}</td>
                  <td className="muted" title={parseServer(t.archived_at)?.toLocaleString()}>{timeAgo(t.archived_at)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => restore(t)} title="Put this ticket back on the board"><ArchiveRestore size={14} /> Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- table */
const COLS = [
  { key: 'key', label: 'ID', icon: Hash, sort: (t) => t.number },
  { key: 'title', label: 'Title', icon: null, sort: (t) => t.title.toLowerCase() },
  { key: 'status', label: 'Status', icon: CircleDot, sort: (t, s) => s.findIndex((x) => x.id === t.status_id) },
  { key: 'assignee', label: 'Assignee', icon: User, sort: (t, s, um) => um[t.assignee_id]?.display_name || '~' },
  { key: 'priority', label: 'Priority', icon: Flag, sort: (t) => PRIORITY_RANK[t.priority] ?? 9 },
  { key: 'tags', label: 'Labels', icon: Tags, sort: (t) => t.tags.join(',') },
  { key: 'due', label: 'Due date', icon: Calendar, sort: (t) => t.due_date || '9999' },
  { key: 'progress', label: 'Checklist', icon: ListChecks, sort: (t) => (t.checklist_total ? t.checklist_done / t.checklist_total : -1) },
  { key: 'meeting', label: 'Meeting', icon: Link2, sort: (t) => t.meeting_title || '~' },
];

export function TicketTable({ project, tickets, update, openTicket, people, allTags, onNew, showProject }) {
  const { userMap, projectMap } = useApp();
  const mobile = useIsMobile();
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const statuses = project?.statuses || [];
  const rows = useMemo(() => {
    if (!sort.key) return tickets;
    const col = COLS.find((c) => c.key === sort.key);
    return [...tickets].sort((a, b) => {
      const x = col.sort(a, statuses, userMap), y = col.sort(b, statuses, userMap);
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [tickets, sort, statuses, userMap]);
  const toggleSort = (key) => setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));
  const statusesFor = (t) => (project ? statuses : projectMap[t.project_id]?.statuses || []);

  if (mobile) return <TicketList rows={rows} statusesFor={statusesFor} openTicket={openTicket} onNew={onNew} />;

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {COLS.filter((c) => showProject || c.key !== 'project').map((c) => (
              <th key={c.key} className="sortable" onClick={() => toggleSort(c.key)} style={c.key === 'title' ? { minWidth: 260 } : c.key === 'assignee' ? { minWidth: 160 } : undefined} title={`Sort by ${c.label.toLowerCase()}`}>
                <span className="th">
                  {c.icon ? <c.icon size={13} /> : <span className="faint">Aa</span>} {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const st = statusesFor(t);
            const done = !!t.completed_at || !!st.find((s) => s.id === t.status_id)?.is_done;
            return (
              <tr key={t.id}>
                <td className="key-cell" onClick={() => openTicket(t.id)}><span className="key"><TicketTypeIcon ticket={t} size={16} />{t.key}</span></td>
                <td className="title-cell" onClick={() => openTicket(t.id)}>
                  {t.parent && <span className="faint small parent-inline" title={t.parent.title}>{t.parent.key} /</span>}
                  <span className="title-link">{t.title}</span>
                  {t.comment_count > 0 && <span className="faint small comment-count"><MessageSquare size={11} /> {t.comment_count}</span>}
                </td>
                <td>{st.length ? <StatusPicker statuses={st} value={t.status_id} onChange={(status_id) => update(t, { status_id })} className="cell-btn" /> : <span className="faint">—</span>}</td>
                <td>{people ? <UserPicker people={people} value={t.assignee_id} onChange={(assignee_id) => update(t, { assignee_id })} className="cell-btn" empty="Unassigned" /> : <Person user={userMap[t.assignee_id]} empty="Unassigned" />}</td>
                <td><PriorityPicker value={t.priority} onChange={(priority) => update(t, { priority })} className="cell-btn" /></td>
                <td>{allTags ? <TagsPicker value={t.tags} allTags={allTags} onChange={(tags) => update(t, { tags })} className="cell-btn" empty="" /> : t.tags.map((g) => <Tag key={g} color={tagColor(g)}>{g}</Tag>)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <DateField value={t.due_date} onChange={(due_date) => update(t, { due_date })} placeholder="—" overdue={isOverdue(t.due_date) && !done} />
                </td>
                <td className="small muted">
                  {t.checklist_total ? (
                    <span className="flex" style={{ gap: 6 }}>
                      <div className="progress" style={{ width: 50 }}><div style={{ width: `${(t.checklist_done / t.checklist_total) * 100}%` }} /></div>
                      {t.checklist_done}/{t.checklist_total}
                    </span>
                  ) : ''}
                </td>
                <td className="small"><span className="ellipsis" style={{ maxWidth: 180 }}>{t.meeting_title || ''}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onNew && <button className="tbl-add" onClick={onNew}><Plus size={14} /> Create ticket</button>}
      {!rows.length && !onNew && <div className="empty-state">Nothing here.</div>}
    </div>
  );
}

/** Phone layout for the list view: one tappable row per ticket. */
function TicketList({ rows, statusesFor, openTicket, onNew }) {
  const { userMap } = useApp();
  return (
    <div className="ticket-list">
      {rows.map((t) => {
        const st = statusesFor(t);
        const status = st.find((s) => s.id === t.status_id);
        const done = !!t.completed_at || !!status?.is_done;
        return (
          <button key={t.id} className={`ticket-row${done ? ' done' : ''}`} onClick={() => openTicket(t.id)}>
            <span className="tr-main">
              <span className="tr-title">{t.title}</span>
              <span className="tr-meta">
                <span className="key"><TicketTypeIcon ticket={t} size={14} />{t.key}</span>
                {status && <StatusTag status={status} />}
                {t.priority && <PriorityIcon value={t.priority} size={14} />}
                <DueBadge date={t.due_date} done={done} />
                {t.comment_count > 0 && <span className="m"><MessageSquare size={12} /> {t.comment_count}</span>}
              </span>
            </span>
            {userMap[t.assignee_id] ? <Avatar user={userMap[t.assignee_id]} size="md" /> : <span className="avatar md unassigned" title="Unassigned"><User size={12} /></span>}
          </button>
        );
      })}
      {onNew && <button className="tbl-add" onClick={onNew}><Plus size={14} /> Create ticket</button>}
      {!rows.length && !onNew && <div className="empty-state">Nothing here.</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- new ticket modal */
export function NewTicketModal({ project, people, allTags = [], defaults = {}, onClose, onCreate }) {
  const { toast } = useApp();
  const [d, setD] = useState({
    title: '', body: '', priority: 'Medium', assignee_id: null, due_date: null, tags: [],
    status_id: project.statuses[0]?.id, ...defaults,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    if (!d.title.trim()) return toast('Give the ticket a title', 'error');
    setBusy(true);
    try { await onCreate(d); onClose(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal
      title="Create ticket"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="faint small modal-tip">⌘/Ctrl + Enter to create</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !d.title.trim()} onClick={submit}>{busy ? 'Creating…' : 'Create ticket'}</button>
        </>
      }
    >
      <p className="form-note">Required fields are marked with an asterisk <span className="req">*</span></p>
      <div className="field">
        <label>Project</label>
        <span className="project-pill"><ProjectIcon project={project} /> {project.name}</span>
      </div>
      <div className="field">
        <label htmlFor="nt-title">Summary <span className="req">*</span></label>
        <input id="nt-title" className="input input-lg" autoFocus placeholder="e.g. Fix receipt printer timeout" value={d.title}
          onChange={(e) => set('title')(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        <span className="hint">A short summary of what needs to be done.</span>
      </div>
      <div className="field">
        <label htmlFor="nt-body">Description</label>
        <textarea id="nt-body" className="textarea" rows={4} placeholder="Add context, links, or what “done” looks like… (markdown supported)" value={d.body}
          onChange={(e) => set('body')(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }} />
      </div>
      <div className="form-grid">
        <div className="field"><label>Status</label><StatusPicker statuses={project.statuses} value={d.status_id} onChange={set('status_id')} className="field-btn" /></div>
        <div className="field"><label>Priority</label><PriorityPicker value={d.priority} onChange={set('priority')} className="field-btn" /></div>
        <div className="field"><label>Assignee</label><UserPicker people={people} value={d.assignee_id} onChange={set('assignee_id')} className="field-btn" empty="Unassigned" /></div>
        <div className="field"><label>Due date</label><div className="field-btn"><DateField value={d.due_date} onChange={set('due_date')} placeholder="No due date" /></div></div>
        <div className="field span-2"><label>Labels</label><TagsPicker value={d.tags} allTags={allTags} onChange={set('tags')} className="field-btn" empty="Add labels to group tickets, e.g. bug, design" /></div>
      </div>
    </Modal>
  );
}
