import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Trash2, MoreHorizontal, Plus, Pencil, X, ListChecks, MessageSquare, Copy, Link, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, ArrowDownUp, Paperclip, ListTree, UploadCloud, Archive, ArchiveRestore,
} from 'lucide-react';
import { api, uploadFile } from '../api';
import { useApp } from '../App';
import { Peek, TitleInput, Prop, MarkdownField, DateField, Person, Avatar, Checkbox, Markdown, AutoTextarea, Menu, useAnchor, InlineInput, Empty, TaskIcon, TicketTypeIcon, ProjectIcon } from '../ui';
import { Attachments, SubTickets, MAX_UPLOAD_MB } from './TicketExtras';
import { StatusPicker, PriorityPicker, UserPicker, TagsPicker, MeetingPicker, useProjectPeople } from '../fields';
import { timeAgo, fmtDateTime, parseServer, isOverdue } from '../lib';

export default function TicketPanel({ id, onClose }) {
  const { userMap, me, toast, bump, confirm, projectMap, openTicket } = useApp();
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const [project, setProject] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [addingItem, setAddingItem] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const commentRef = useRef(null);
  const [menu, openMenu, closeMenu] = useAnchor();
  const people = useProjectPeople(project);

  const load = useCallback(async () => {
    try {
      const ticket = await api.get(`/tickets/${id}`);
      setT(ticket);
      const [p, tags] = await Promise.all([api.get(`/projects/${ticket.project_id}`), api.get(`/projects/${ticket.project_id}/tags`)]);
      setProject(p);
      setAllTags(tags);
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    setT((cur) => ({ ...cur, ...patch }));
    try {
      const updated = await api.patch(`/tickets/${id}`, patch);
      setT((cur) => ({ ...cur, ...updated }));
      bump();
      if ('status_id' in patch || 'assignee_id' in patch) api.get(`/tickets/${id}`).then((x) => setT(x));
    } catch (e) { toast(e.message, 'error'); load(); }
  };
  const upload = (fileList) => {
    for (const file of [...fileList]) {
      const key = Math.random();
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { toast(`“${file.name}” is too large — the limit is ${MAX_UPLOAD_MB} MB`, 'error'); continue; }
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      uploadFile(`/tickets/${id}/attachments`, file, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))))
        .then((a) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          setT((cur) => ({ ...cur, attachments: [...cur.attachments, a], attachment_count: cur.attachment_count + 1 }));
          bump();
        })
        .catch((e) => {
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e.message } : x)));
          setTimeout(() => setUploads((u) => u.filter((x) => x.key !== key)), 6000);
        });
    }
  };
  const dropProps = {
    onDragEnter: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } },
    onDragOver: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } setDragging(false); },
  };
  const remove = async () => {
    const subNote = t.subtasks.length ? ` Its ${t.subtasks.length} sub-ticket(s) will be kept as normal tickets.` : '';
    if (!(await confirm({ title: `Delete ${t.key}?`, message: `This ticket, its comments, checklist and attachments will be permanently deleted.${subNote}`, danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/tickets/${id}`);
    toast(`${t.key} deleted`);
    bump();
    onClose();
  };
  const archive = async () => {
    try {
      const u = await api.post(`/tickets/${id}/archive`);
      setT((cur) => ({ ...cur, ...u }));
      bump();
      toast(`${t.key} moved to history`, 'info', { label: 'Undo', onClick: () => restore() });
    } catch (e) { toast(e.message, 'error'); }
  };
  const restore = async () => {
    try {
      const u = await api.post(`/tickets/${id}/restore`);
      setT((cur) => ({ ...cur, ...u }));
      bump();
      toast(`${u.key} is back on the board`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const copyLink = () => {
    const url = `${window.location.origin}/p/${t.project_id}/tickets?t=${t.id}`;
    navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast(url));
  };

  if (error) return <Peek size="ticket" onClose={onClose}><Empty icon="🔒" title="Can't open this ticket" text={error} /></Peek>;
  if (!t || !project) return <Peek size="ticket" onClose={onClose}><div className="empty-state">Loading ticket…</div></Peek>;

  const done = t.checklist.filter((c) => c.done).length;
  const proj = projectMap[t.project_id] || project;
  const status = project.statuses.find((s) => s.id === t.status_id);
  const isDone = !!status?.is_done;
  const doneStatus = project.statuses.find((s) => s.is_done);
  const canAssignMe = t.assignee_id !== me.id && people.some((u) => u.id === me.id);

  return (
    <Peek
      size="ticket"
      onClose={onClose}
      onExpand={() => navigate(`/p/${t.project_id}/tickets?t=${t.id}`)}
      head={
        <span className="flex peek-crumb">
          <span className="ellipsis"><ProjectIcon project={proj} /> {proj.name}</span><span className="faint">/</span>
          {t.parent && (
            <>
              <button className="crumb-key" onClick={() => openTicket(t.parent.id)} title={`Open parent: ${t.parent.title}`}><TaskIcon size={14} />{t.parent.key}</button>
              <span className="faint">/</span>
            </>
          )}
          <button className="crumb-key" onClick={copyLink} title="Copy link to this ticket"><TicketTypeIcon ticket={t} size={14} />{t.key}</button>
        </span>
      }
      actions={
        <>
          <button className="icon-btn" onClick={copyLink} title="Copy link to this ticket" aria-label="Copy link"><Link size={16} /></button>
          <button className="icon-btn" onClick={openMenu} title="More actions" aria-label="More actions"><MoreHorizontal size={18} /></button>
          <Menu
            anchor={menu}
            onClose={closeMenu}
            align="right"
            items={[
              { label: 'Copy link', icon: <Copy size={15} />, onClick: copyLink },
              isDone && !t.archived_at && { label: 'Move to history', icon: <Archive size={15} />, onClick: archive },
              t.archived_at && { label: 'Restore to board', icon: <ArchiveRestore size={15} />, onClick: restore },
              '-',
              { label: 'Delete ticket', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]}
          />
        </>
      }
    >
      {t.archived_at && (
        <div className="history-banner">
          <Archive size={16} />
          <span><b>This ticket is in history.</b> It's done and hidden from the board and list.</span>
          <button className="btn sm" onClick={restore}><ArchiveRestore size={14} /> Restore to board</button>
        </div>
      )}
      <div className={`issue-grid${dragging ? ' drop-active' : ''}`} {...dropProps}>
        {dragging && <div className="drop-overlay"><UploadCloud size={28} /> Drop files to attach them to {t.key}</div>}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        <div className="issue-head">
          <TitleInput value={t.title} onSave={(title) => save({ title })} className="title-input issue-title" />
          <div className="quick-actions">
            <button className="btn" onClick={() => fileRef.current?.click()} title="Attach files, documents or images"><Paperclip size={15} /> Attach</button>
            {!t.parent_id && <button className="btn" onClick={() => setAddingSub(true)} title="Split this ticket into smaller tickets"><ListTree size={15} /> Add sub-ticket</button>}
            <button className="btn" onClick={() => setAddingItem(true)}><ListChecks size={15} /> Add checklist item</button>
            <button className="btn" onClick={() => commentRef.current?.focus()}><MessageSquare size={15} /> Comment</button>
          </div>
        </div>

        <aside className="issue-side">
          <div className="issue-status">
            <StatusPicker statuses={project.statuses} value={t.status_id} onChange={(status_id) => save({ status_id })} className={`status-btn c-${status?.color || 'gray'}`}>
              {status?.name || 'No status'}<ChevronDown size={16} />
            </StatusPicker>
            {!isDone && doneStatus && (
              <button className="btn" onClick={() => { save({ status_id: doneStatus.id }); toast(`${t.key} marked as ${doneStatus.name}`); }}>
                <CheckCircle2 size={15} /> Mark as done
              </button>
            )}
            {isDone && !t.archived_at && (
              <button className="btn" onClick={archive} title="Take this finished ticket off the board. You can restore it from History."><Archive size={15} /> Move to history</button>
            )}
            {isOverdue(t.due_date) && !isDone && <span className="tag c-red overdue-flag"><AlertTriangle size={12} /> Overdue</span>}
          </div>

          <div className="details-card">
            <button className="details-head" onClick={() => setDetailsOpen((o) => !o)} aria-expanded={detailsOpen}>
              Details {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {detailsOpen && (
              <div className="details-body">
                <Prop label="Assignee" static>
                  <span className="assign-wrap">
                    <UserPicker people={people} value={t.assignee_id} onChange={(assignee_id) => save({ assignee_id })} className="cell-btn" empty={<span className="person"><span className="avatar md unassigned"><User size={12} /></span>Unassigned</span>} />
                    {canAssignMe && <button className="link-btn" onClick={() => save({ assignee_id: me.id })}>Assign to me</button>}
                  </span>
                </Prop>
                <Prop label="Reporter" static>
                  <UserPicker people={people} value={t.reporter_id} onChange={(reporter_id) => save({ reporter_id })} className="cell-btn" empty="None" />
                </Prop>
                {t.parent && (
                  <Prop label="Parent" static>
                    <button className="cell-btn parent-link" onClick={() => openTicket(t.parent.id)} title="Open the parent ticket">
                      <TaskIcon size={16} /><b>{t.parent.key}</b><span className="ellipsis">{t.parent.title}</span>
                    </button>
                  </Prop>
                )}
                <Prop label="Priority" static>
                  <PriorityPicker value={t.priority} onChange={(priority) => save({ priority })} className="cell-btn" empty="None" />
                </Prop>
                <Prop label="Due date" static>
                  <DateField value={t.due_date} onChange={(due_date) => save({ due_date })} placeholder="None" overdue={isOverdue(t.due_date) && !isDone} />
                </Prop>
                <Prop label="Start date" static>
                  <DateField value={t.start_date} onChange={(start_date) => save({ start_date })} placeholder="None" />
                </Prop>
                <Prop label="Labels" static>
                  <TagsPicker value={t.tags} allTags={allTags} onChange={(tags) => save({ tags })} className="cell-btn" empty="None" />
                </Prop>
                <Prop label="Estimate" static>
                  <InlineInput value={t.estimate} onSave={(estimate) => save({ estimate })} placeholder="e.g. 2h, 3 days" />
                </Prop>
                <Prop label="Meeting" static>
                  <span className="flex" style={{ width: '100%', gap: 4 }}>
                    <MeetingPicker projectId={t.project_id} value={t.meeting_id} title={t.meeting_title} onChange={(meeting_id) => save({ meeting_id })} className="cell-btn" />
                    {t.meeting_id && (
                      <button className="btn ghost sm" onClick={() => navigate(`/p/${t.project_id}/meetings?m=${t.meeting_id}`)}>Open</button>
                    )}
                  </span>
                </Prop>
              </div>
            )}
          </div>
          <div className="issue-meta">
            <span title={parseServer(t.created_at)?.toLocaleString()}>Created {timeAgo(t.created_at)}</span>
            <span title={parseServer(t.updated_at)?.toLocaleString()}>Updated {timeAgo(t.updated_at)}</span>
            {t.completed_at && <span className="ok">Completed {timeAgo(t.completed_at)}</span>}
          </div>
        </aside>

        <div className="issue-main">
          <h3 className="section-title">Description</h3>
          <MarkdownField value={t.body} onSave={(body) => save({ body })} placeholder="Add a description…" />

          <Attachments ticket={t} uploads={uploads} onPick={() => fileRef.current?.click()} onDeleted={(aid) => { setT((cur) => ({ ...cur, attachments: cur.attachments.filter((a) => a.id !== aid) })); bump(); }} />

          <SubTickets ticket={t} project={project} people={people} adding={addingSub} setAdding={setAddingSub} onOpen={openTicket} onChange={setT} />

          <Checklist ticket={t} setT={setT} done={done} adding={addingItem} setAdding={setAddingItem} />

          <ActivitySection t={t} me={me} userMap={userMap} commentRef={commentRef} onChange={load} onPosted={() => { load(); bump(); }} />
        </div>
      </div>
    </Peek>
  );
}

/** Jira-style activity: one feed with All / Comments / History filters. */
function ActivitySection({ t, me, userMap, commentRef, onChange, onPosted }) {
  const [show, setShow] = useState('comments');
  const [newest, setNewest] = useState(true);

  // Press M anywhere in the ticket to jump to the comment box.
  useEffect(() => {
    const k = (e) => {
      if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable || document.querySelector('.popover, .overlay')) return;
      e.preventDefault();
      setShow((s) => (s === 'history' ? 'comments' : s));
      setTimeout(() => commentRef.current?.focus());
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [commentRef]);

  const items = useMemo(() => {
    const list = [
      ...(show !== 'history' ? t.comments.map((c) => ({ kind: 'comment', at: c.created_at, c })) : []),
      ...(show !== 'comments' ? t.activity.map((a) => ({ kind: 'history', at: a.created_at, a })) : []),
    ];
    return list.sort((x, y) => (parseServer(x.at) - parseServer(y.at)) * (newest ? -1 : 1));
  }, [t.comments, t.activity, show, newest]);

  const tabs = [['all', 'All'], ['comments', 'Comments'], ['history', 'History']];
  return (
    <>
      <h3 className="section-title">Activity</h3>
      <div className="activity-bar">
        <span className="faint">Show:</span>
        {tabs.map(([k, label]) => (
          <button key={k} className={`act-tab${show === k ? ' on' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>{label}</button>
        ))}
        <button className="btn ghost sm sort-btn" onClick={() => setNewest((n) => !n)} title="Change sort order">
          {newest ? 'Newest first' : 'Oldest first'} <ArrowDownUp size={13} />
        </button>
      </div>
      {show !== 'history' && <CommentBox ticketId={t.id} inputRef={commentRef} onPosted={onPosted} />}
      {!items.length && (
        <div className="faint small activity-empty">
          {show === 'history' ? 'No changes yet.' : show === 'comments' ? 'No comments yet. Ask a question or post an update.' : 'Nothing here yet.'}
        </div>
      )}
      {items.map((it) =>
        it.kind === 'comment' ? (
          <Comment key={`c${it.c.id}`} c={it.c} canEdit={it.c.user_id === me.id || me.role === 'admin'} onChange={onChange} />
        ) : (
          <div key={`a${it.a.id}`} className="feed-item">
            <Avatar user={userMap[it.a.user_id]} size="md" />
            <div className="txt"><b>{userMap[it.a.user_id]?.display_name || 'Someone'}</b> {it.a.action} <span>{it.a.detail?.replace(t.key, '').replace(/^ → /, '→ ')}</span></div>
            <span className="when" title={parseServer(it.a.created_at)?.toLocaleString()}>{timeAgo(it.a.created_at)}</span>
          </div>
        )
      )}
    </>
  );
}

function Checklist({ ticket, setT, done, adding, setAdding }) {
  const { toast, bump } = useApp();
  const [text, setText] = useState('');
  const add = async () => {
    if (!text.trim()) return setAdding(false);
    try {
      const item = await api.post(`/tickets/${ticket.id}/checklist`, { text });
      setT((t) => ({ ...t, checklist: [...t.checklist, item] }));
      setText('');
      bump();
    } catch (e) { toast(e.message, 'error'); }
  };
  const update = async (item, patch) => {
    setT((t) => ({ ...t, checklist: t.checklist.map((c) => (c.id === item.id ? { ...c, ...patch } : c)) }));
    await api.patch(`/checklist/${item.id}`, patch);
    bump();
  };
  const del = async (item) => {
    setT((t) => ({ ...t, checklist: t.checklist.filter((c) => c.id !== item.id) }));
    await api.del(`/checklist/${item.id}`);
    bump();
  };
  const total = ticket.checklist.length;
  return (
    <>
      <h3 className="section-title">
        Checklist
        {total > 0 && <span className="muted">{done}/{total}</span>}
        {total > 0 && <div className="progress" style={{ width: 120 }}><div style={{ width: `${(done / total) * 100}%` }} /></div>}
      </h3>
      {ticket.checklist.map((c) => (
        <div key={c.id} className={`check-row${c.done ? ' done' : ''}`}>
          <Checkbox checked={!!c.done} onChange={(v) => update(c, { done: v })} />
          <span className="t grow"><InlineInput value={c.text} onSave={(v) => v.trim() && update(c, { text: v })} /></span>
          <button className="icon-btn sm del" onClick={() => del(c)}><X size={13} /></button>
        </div>
      ))}
      {adding ? (
        <div className="check-row">
          <Checkbox checked={false} onChange={() => {}} />
          <input
            className="bare-input"
            autoFocus
            placeholder="Add an item… (Enter to save)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setText(''); } }}
            onBlur={() => { if (!text.trim()) setAdding(false); }}
          />
        </div>
      ) : (
        <button className="add-card" onClick={() => setAdding(true)}><Plus size={14} /> {total ? 'Add item' : 'Add a checklist item to break the work into steps'}</button>
      )}
    </>
  );
}

function Comment({ c, canEdit, onChange }) {
  const { userMap, toast, confirm } = useApp();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(c.body);
  const u = userMap[c.user_id];
  const save = async () => {
    try { await api.patch(`/comments/${c.id}`, { body: v }); setEditing(false); onChange(); } catch (e) { toast(e.message, 'error'); }
  };
  const del = async () => {
    if (!(await confirm({ title: 'Delete comment?', message: 'This cannot be undone.', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/comments/${c.id}`);
    onChange();
  };
  return (
    <div className="comment">
      <Avatar user={u} size="md" />
      <div className="c-body">
        <div className="c-head">
          <b>{u?.display_name || 'Former user'}</b>
          <span className="when" title={parseServer(c.created_at)?.toLocaleString()}>{timeAgo(c.created_at)}{c.updated_at ? ' (edited)' : ''}</span>
          {canEdit && !editing && (
            <span className="c-actions">
              <button className="icon-btn sm" title="Edit" onClick={() => setEditing(true)}><Pencil size={12} /></button>
              <button className="icon-btn sm" title="Delete" onClick={del}><Trash2 size={12} /></button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="comment-box" style={{ paddingTop: 4 }}>
            <div className="box">
              <AutoTextarea autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && save()} />
              <div className="foot"><span /><span className="flex"><button className="btn sm ghost" onClick={() => { setEditing(false); setV(c.body); }}>Cancel</button><button className="btn sm primary" onClick={save}>Save</button></span></div>
            </div>
          </div>
        ) : (
          <Markdown text={c.body} />
        )}
      </div>
    </div>
  );
}

function CommentBox({ ticketId, onPosted, inputRef }) {
  const { me, toast, users } = useApp();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const mentionQuery = (v.match(/@([A-Za-z0-9._-]*)$/) || [])[1];
  const suggestions = mentionQuery !== undefined
    ? users.filter((u) => u.active && (u.username.toLowerCase().includes(mentionQuery.toLowerCase()) || u.display_name.toLowerCase().includes(mentionQuery.toLowerCase()))).slice(0, 5)
    : [];
  const post = async () => {
    if (!v.trim()) return;
    setBusy(true);
    try { await api.post(`/tickets/${ticketId}/comments`, { body: v }); setV(''); onPosted(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="comment-box">
      <Avatar user={me} size="md" />
      <div className="box" style={{ position: 'relative' }}>
        <AutoTextarea
          ref={inputRef}
          value={v}
          placeholder="Add a comment… use @ to mention someone"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(); }}
        />
        {suggestions.length > 0 && (
          <div className="popover" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}>
            {suggestions.map((u) => (
              <button key={u.id} className="menu-item" onMouseDown={(e) => { e.preventDefault(); setV(v.replace(/@([A-Za-z0-9._-]*)$/, `@${u.username} `)); }}>
                <Person user={u} /> <span className="muted">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
        {v.trim() && (
          <div className="foot">
            <span>⌘/Ctrl + Enter to send</span>
            <span className="flex" style={{ gap: 4 }}>
              <button className="btn sm ghost" onClick={() => setV('')}>Cancel</button>
              <button className="btn sm primary" disabled={busy} onClick={post}>Save</button>
            </span>
          </div>
        )}
      </div>
      {!v && <div className="pro-tip">Pro tip: press <span className="kbd">M</span> to comment</div>}
    </div>
  );
}

export { fmtDateTime };
