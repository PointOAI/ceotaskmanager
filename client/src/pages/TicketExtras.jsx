import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Trash2, X, FileText, FileArchive, FileSpreadsheet, FileImage, FileVideo, FileAudio, File, Plus, UploadCloud } from 'lucide-react';
import { api, fetchBlob } from '../api';
import { useApp } from '../App';
import { Avatar, SubtaskIcon, PriorityIcon, StatusTag, useAnchor, SelectMenu, Person, AutoTextarea } from '../ui';
import { StatusPicker } from '../fields';
import { fmtSize, timeAgo, parseServer } from '../lib';

export const MAX_UPLOAD_MB = 25;
const RASTER = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/;
// Types that are safe to open in a browser tab; everything else is downloaded.
const OPENABLE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|text\/plain|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm))$/;

function fileIcon(a) {
  const m = a.mime || '';
  const ext = a.filename.split('.').pop().toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (m.startsWith('audio/')) return FileAudio;
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return FileArchive;
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return FileSpreadsheet;
  if (m === 'application/pdf' || ['doc', 'docx', 'txt', 'md', 'rtf', 'pages', 'ppt', 'pptx', 'key'].includes(ext)) return FileText;
  return File;
}

/** Loads a protected image with the session token and shows it. */
function AuthImage({ id, alt, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    let live = true;
    fetchBlob(`/attachments/${id}/file`).then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt={alt} className={className} draggable={false} /> : <span className={`${className} loading`} />;
}

async function saveFile(a) {
  const blob = await fetchBlob(`/attachments/${a.id}/file`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Jira-style attachments strip: thumbnails for images, icons for other files, drop zone when empty. */
export function Attachments({ ticket, uploads, onPick, onDeleted }) {
  const { userMap, me, toast, confirm } = useApp();
  const [preview, setPreview] = useState(null);
  const list = ticket.attachments;

  const open = async (a) => {
    if (RASTER.test(a.mime)) return setPreview(a);
    if (!OPENABLE.test(a.mime)) return saveFile(a).catch((e) => toast(e.message, 'error'));
    const w = window.open('', '_blank'); // open now so the browser doesn't block it as a pop-up
    try {
      const blob = await fetchBlob(`/attachments/${a.id}/file`);
      const url = URL.createObjectURL(blob);
      if (w) w.location = url; else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { w?.close(); toast(e.message, 'error'); }
  };
  const remove = async (a) => {
    if (!(await confirm({ title: `Delete “${a.filename}”?`, message: 'The file will be removed from this ticket for everyone.', danger: true, confirmText: 'Delete' }))) return;
    try { await api.del(`/attachments/${a.id}`); onDeleted(a.id); toast('Attachment deleted'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <h3 className="section-title">
        Attachments {list.length > 0 && <span className="muted">{list.length}</span>}
        {list.length > 0 && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onPick}><Plus size={14} /> Add</button>}
      </h3>
      {!list.length && !uploads.length ? (
        <button className="dropzone" onClick={onPick}>
          <UploadCloud size={18} />
          <span>Drop files here to attach, or <span className="linkish">browse</span></span>
          <span className="faint small">Images, documents, PDFs — up to {MAX_UPLOAD_MB} MB each</span>
        </button>
      ) : (
        <div className="attach-grid">
          {list.map((a) => {
            const Icon = fileIcon(a);
            const canDelete = a.user_id === me.id || me.role === 'admin';
            return (
              <div key={a.id} className="attach">
                <button className="attach-thumb" onClick={() => open(a)} title={RASTER.test(a.mime) ? 'Preview' : OPENABLE.test(a.mime) ? 'Open in a new tab' : 'Download'}>
                  {RASTER.test(a.mime) ? <AuthImage id={a.id} alt={a.filename} className="attach-img" /> : <span className="attach-ico"><Icon size={28} strokeWidth={1.5} /><b>{a.filename.includes('.') ? a.filename.split('.').pop().slice(0, 5) : 'file'}</b></span>}
                </button>
                <div className="attach-info">
                  <span className="attach-name" title={a.filename}>{a.filename}</span>
                  <span className="attach-meta" title={`Added by ${userMap[a.user_id]?.display_name || 'someone'} · ${parseServer(a.created_at)?.toLocaleString()}`}>{fmtSize(a.size)} · {timeAgo(a.created_at)}</span>
                </div>
                <div className="attach-actions">
                  <button className="icon-btn sm" onClick={() => saveFile(a).catch((e) => toast(e.message, 'error'))} title="Download" aria-label={`Download ${a.filename}`}><Download size={14} /></button>
                  {canDelete && <button className="icon-btn sm" onClick={() => remove(a)} title="Delete" aria-label={`Delete ${a.filename}`}><Trash2 size={14} /></button>}
                </div>
              </div>
            );
          })}
          {uploads.map((u) => (
            <div key={u.key} className={`attach uploading${u.error ? ' failed' : ''}`}>
              <div className="attach-thumb"><span className="attach-ico"><Paperclip size={24} strokeWidth={1.5} /></span></div>
              <div className="attach-info">
                <span className="attach-name" title={u.name}>{u.name}</span>
                {u.error ? <span className="attach-meta err">{u.error}</span> : <span className="upload-bar"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {preview && <ImagePreview a={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function ImagePreview({ a, onClose }) {
  const { toast } = useApp();
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-bar">
        <span className="ellipsis">{a.filename} <span className="faint">· {fmtSize(a.size)}</span></span>
        <button className="btn sm" onClick={() => saveFile(a).catch((e) => toast(e.message, 'error'))}><Download size={14} /> Download</button>
        <button className="icon-btn" onClick={onClose} aria-label="Close preview" title="Close (Esc)"><X size={18} /></button>
      </div>
      <AuthImage id={a.id} alt={a.filename} className="lightbox-img" />
    </div>
  );
}

/** Jira-style child work items: list with progress, inline create, editable status and assignee. */
export function SubTickets({ ticket, project, people, adding, setAdding, onOpen, onChange }) {
  const { toast, bump } = useApp();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const subs = ticket.subtasks;
  const doneIds = new Set(project.statuses.filter((s) => s.is_done).map((s) => s.id));
  const doneCount = subs.filter((s) => doneIds.has(s.status_id)).length;

  if (ticket.parent_id) return null; // one level only, like Jira

  const create = async () => {
    if (!title.trim()) return setAdding(false);
    setBusy(true);
    try {
      const sub = await api.post(`/projects/${ticket.project_id}/tickets`, { title: title.trim(), parent_id: ticket.id });
      onChange((t) => ({ ...t, subtasks: [...t.subtasks, sub], subtask_total: t.subtask_total + 1 }));
      setTitle('');
      bump();
      ref.current?.focus();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const update = async (sub, patch) => {
    onChange((t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === sub.id ? { ...s, ...patch } : s)) }));
    try {
      const u = await api.patch(`/tickets/${sub.id}`, patch);
      onChange((t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === sub.id ? u : s)) }));
      bump();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <h3 className="section-title">
        Sub-tickets
        {subs.length > 0 && <span className="muted">{doneCount} of {subs.length} done</span>}
        {subs.length > 0 && <div className="progress" style={{ width: 120 }}><div style={{ width: `${(doneCount / subs.length) * 100}%` }} /></div>}
      </h3>
      {subs.length > 0 && (
        <div className="sub-list">
          {subs.map((s) => (
            <div key={s.id} className={`sub-row${doneIds.has(s.status_id) ? ' done' : ''}`}>
              <button className="sub-main" onClick={() => onOpen(s.id)} title={`Open ${s.key}`}>
                <SubtaskIcon size={16} />
                <span className="sub-key">{s.key}</span>
                <span className="sub-title">{s.title}</span>
              </button>
              {s.priority && <span className="sub-prio" title={`${s.priority} priority`}><PriorityIcon value={s.priority} /></span>}
              <SubAssignee people={people} value={s.assignee_id} onChange={(assignee_id) => update(s, { assignee_id })} />
              <StatusPicker statuses={project.statuses} value={s.status_id} onChange={(status_id) => update(s, { status_id })} className="sub-status">
                <StatusTag status={project.statuses.find((x) => x.id === s.status_id)} />
              </StatusPicker>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <div className="sub-new">
          <SubtaskIcon size={16} />
          <AutoTextarea
            ref={ref}
            className="bare-input"
            autoFocus
            placeholder="What needs to be done? Press Enter to create"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setTitle(''); } }}
            onBlur={() => { if (!title.trim()) setAdding(false); }}
          />
          <button className="btn primary sm" onMouseDown={(e) => e.preventDefault()} onClick={create} disabled={busy || !title.trim()}>Create</button>
          <button className="btn ghost sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setAdding(false); setTitle(''); }}>Cancel</button>
        </div>
      ) : (
        <button className="add-card" onClick={() => setAdding(true)}><Plus size={14} /> {subs.length ? 'Create sub-ticket' : 'Create a sub-ticket to split this work into smaller tickets'}</button>
      )}
    </>
  );
}

function SubAssignee({ people, value, onChange }) {
  const { userMap } = useApp();
  const [a, open, close] = useAnchor();
  const u = userMap[value];
  return (
    <>
      <button className="sub-assignee" onClick={open} title={u ? `Assigned to ${u.display_name} — click to change` : 'Unassigned — click to assign'}>
        {u ? <Avatar user={u} size="md" /> : <span className="avatar md unassigned"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg></span>}
      </button>
      <SelectMenu anchor={a} onClose={close} allowClear={!!value} value={value} onChange={onChange} placeholder="Search people…"
        options={people.map((p) => ({ value: p.id, label: p.display_name, render: <Person user={p} /> }))} />
    </>
  );
}
