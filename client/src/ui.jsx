import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Check, X, Search, Plus, Maximize2, ChevronsUp, ChevronUp, ChevronDown, Equal, CalendarDays } from 'lucide-react';
import { initials, priorityColor, fmtDate, fmtDateTime } from './lib';

marked.setOptions({ gfm: true, breaks: true });

/* ---------------------------------------------------------------- basic bits */
export function Tag({ color = 'gray', children, dot, status, onRemove, title }) {
  return (
    <span className={`tag c-${color}${status ? ' status' : ''}`} title={title}>
      {dot && <span className="dot" />}
      <span className="ellipsis">{children}</span>
      {onRemove && (
        <button className="x" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}
export const StatusTag = ({ status }) =>
  status ? <Tag color={status.color} status>{status.name}</Tag> : <span className="empty">No status</span>;
export const PriorityTag = ({ value }) => (value ? <Tag color={priorityColor(value)}>{value}</Tag> : null);

/** Jira-style work-item type icon: a small blue square with a check. */
export function TaskIcon({ size = 16 }) {
  return (
    <svg className="task-ico" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="3" fill="#4bade8" />
      <path d="M4.5 8.2l2.3 2.3 4.7-4.9" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Jira-style sub-task icon: a small blue square with two linked boxes. */
export function SubtaskIcon({ size = 16 }) {
  return (
    <svg className="task-ico" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="3" fill="#4bade8" />
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" fill="none" stroke="#fff" strokeWidth="1.5" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="1" fill="#fff" />
    </svg>
  );
}
export const TicketTypeIcon = ({ ticket, size }) => (ticket?.parent_id ? <SubtaskIcon size={size} /> : <TaskIcon size={size} />);

const PRIORITY_ICONS = { Urgent: ChevronsUp, High: ChevronUp, Medium: Equal, Low: ChevronDown };
/** Jira-style priority: a colored arrow, optionally followed by the word. */
export function PriorityIcon({ value, size = 15 }) {
  const I = PRIORITY_ICONS[value];
  if (!I) return null;
  return <I size={size} strokeWidth={2.6} className={`prio-ico prio-${value.toLowerCase()}`} aria-label={`${value} priority`} />;
}
export function PriorityLabel({ value, empty = 'Empty' }) {
  if (!value) return <span className="empty">{empty}</span>;
  return <span className="prio"><PriorityIcon value={value} />{value}</span>;
}

/** True below the phone breakpoint; follows window resizes. */
export function useIsMobile(query = '(max-width: 760px)') {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

export function Avatar({ user, size = '' }) {
  if (!user) return null;
  return (
    <span className={`avatar c-${user.color || 'gray'} ${size}`} title={user.display_name}>
      {initials(user.display_name)}
    </span>
  );
}
export function Person({ user, size, empty = 'Empty' }) {
  if (!user) return <span className="empty">{empty}</span>;
  return (
    <span className="person">
      <Avatar user={user} size={size} />
      <span className="nm">{user.display_name}</span>
    </span>
  );
}
export function Checkbox({ checked, onChange, size = 16 }) {
  return (
    <button
      type="button"
      className={`cbx${checked ? ' on' : ''}`}
      style={{ width: size, height: size }}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      aria-pressed={checked}
    >
      {checked && <Check size={size - 4} strokeWidth={3} />}
    </button>
  );
}
export function Empty({ icon = '🗂️', title, text, action }) {
  return (
    <div className="empty-big">
      <div className="ico">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- popover */
export function useAnchor() {
  const [anchor, setAnchor] = useState(null);
  const open = (e) => {
    e?.stopPropagation?.();
    setAnchor(e.currentTarget.getBoundingClientRect());
  };
  return [anchor, open, () => setAnchor(null)];
}

export function Popover({ anchor, onClose, children, width, align = 'left' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let top = anchor.bottom + 4;
    let left = align === 'right' ? anchor.right - r.width : anchor.left;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, anchor.top - r.height - 4);
    left = Math.min(Math.max(8, left), window.innerWidth - r.width - 8);
    setPos({ top, left });
  }, [anchor, align]);
  useEffect(() => {
    if (!anchor) return;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);
  if (!anchor) return null;
  return createPortal(
    <div ref={ref} className="popover" style={{ ...pos, width }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
}

export function Menu({ anchor, onClose, items, align }) {
  return (
    <Popover anchor={anchor} onClose={onClose} align={align}>
      {items.filter(Boolean).map((it, i) =>
        it === '-' ? (
          <div key={i} className="menu-sep" />
        ) : it.label && !it.onClick ? (
          <div key={i} className="menu-label">{it.label}</div>
        ) : (
          <button key={i} className={`menu-item${it.danger ? ' danger' : ''}`} onClick={() => { onClose(); it.onClick(); }}>
            {it.icon}
            <span className="grow">{it.label}</span>
            {it.checked && <Check size={14} className="check" />}
            {it.hint && <span className="muted">{it.hint}</span>}
          </button>
        )
      )}
    </Popover>
  );
}

/**
 * Generic searchable select. options: [{ value, label, render }]
 * multi: value is array. onCreate: allow creating new value from search text.
 */
export function SelectMenu({ anchor, onClose, options, value, onChange, multi, searchable = true, placeholder = 'Search…', onCreate, allowClear, align, width = 240 }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  useEffect(() => { if (anchor) { setQ(''); setFocus(0); } }, [anchor]);
  const filtered = useMemo(
    () => options.filter((o) => String(o.label).toLowerCase().includes(q.trim().toLowerCase())),
    [options, q]
  );
  const canCreate = onCreate && q.trim() && !options.some((o) => String(o.label).toLowerCase() === q.trim().toLowerCase());
  const isOn = (v) => (multi ? (value || []).includes(v) : value === v);
  const choose = (v) => {
    if (multi) {
      const cur = value || [];
      onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    } else {
      onChange(v);
      onClose();
    }
  };
  const onKey = (e) => {
    const n = filtered.length + (canCreate ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => (f + 1) % Math.max(n, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => (f - 1 + n) % Math.max(n, 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (focus < filtered.length) choose(filtered[focus].value);
      else if (canCreate) { onCreate(q.trim()); setQ(''); }
    }
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={width} align={align}>
      {searchable && (
        <div className="menu-search">
          <input autoFocus placeholder={onCreate ? 'Search or create…' : placeholder} value={q} onChange={(e) => { setQ(e.target.value); setFocus(0); }} onKeyDown={onKey} />
        </div>
      )}
      {allowClear && (
        <button className="menu-item" onClick={() => { onChange(multi ? [] : null); if (!multi) onClose(); }}>
          <span className="faint">Clear</span>
        </button>
      )}
      {filtered.map((o, i) => (
        <button key={String(o.value)} className={`menu-item${i === focus ? ' focused' : ''}`} onMouseEnter={() => setFocus(i)} onClick={() => choose(o.value)}>
          <span className="grow" style={{ minWidth: 0 }}>{o.render || o.label}</span>
          {isOn(o.value) && <Check size={14} className="check" />}
        </button>
      ))}
      {canCreate && (
        <button className={`menu-item${focus === filtered.length ? ' focused' : ''}`} onClick={() => { onCreate(q.trim()); setQ(''); }}>
          <Plus size={14} /> Create <b>{q.trim()}</b>
        </button>
      )}
      {!filtered.length && !canCreate && <div className="empty-state">No results</div>}
    </Popover>
  );
}

/* ---------------------------------------------------------------- modal / peek */
export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Peek({ onClose, children, head, wide, size, onExpand, actions }) {
  const self = useRef(null);
  useEffect(() => {
    const k = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.popover') || document.querySelector('.overlay')) return;
      if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;
      const all = document.querySelectorAll('.peek');
      if (all[all.length - 1] === self.current) onClose();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <>
      <div className={`peek-overlay${size ? ` ${size}` : ''}`} onMouseDown={onClose} />
      <aside ref={self} className={`peek${wide ? ' wide' : ''}${size ? ` ${size}` : ''}`} role="dialog">
        <div className="peek-head">
          <div className="grow">{head}</div>
          {actions}
          {onExpand && <button className="icon-btn" onClick={onExpand} title="Open as full page" aria-label="Open as full page"><Maximize2 size={15} /></button>}
          <button className="icon-btn close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="peek-body">{children}</div>
      </aside>
    </>,
    document.body
  );
}

/* ---------------------------------------------------------------- text editing */
export function AutoTextarea({ value, onChange, className, minRows = 1, ref: outerRef, ...rest }) {
  const ref = useRef(null);
  const setRef = (el) => {
    ref.current = el;
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) outerRef.current = el;
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return <textarea ref={setRef} rows={minRows} className={className} value={value} onChange={onChange} {...rest} />;
}

export function TitleInput({ value, onSave, placeholder = 'Untitled', className = 'title-input' }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const commit = () => {
    const t = v.trim();
    if (!t) return setV(value || '');
    if (t !== value) onSave(t);
  };
  return (
    <AutoTextarea
      className={className}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

export function InlineInput({ value, onSave, placeholder = 'Empty', type = 'text' }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <input
      className="bare-input"
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value || '') && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function Markdown({ text, className = '' }) {
  const html = useMemo(() => {
    const raw = marked.parse(text || '');
    const withMentions = raw.replace(/(^|[\s>(])@([A-Za-z0-9._-]{3,32})/g, '$1<span class="mention">@$2</span>');
    return DOMPurify.sanitize(withMentions, { ADD_ATTR: ['target'] });
  }, [text]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Notion-ish block: rendered markdown, click to edit, saves on blur / Cmd+Enter. */
export function MarkdownField({ value, onSave, placeholder = 'Click to add…', minHeight = 90, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  const [v, setV] = useState(value || '');
  useEffect(() => { if (!editing) setV(value || ''); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (v !== (value || '')) onSave(v);
  };
  if (editing)
    return (
      <div>
        <AutoTextarea
          autoFocus
          className="md-editor"
          style={{ minHeight }}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit();
            if (e.key === 'Escape') { e.stopPropagation(); commit(); }
          }}
        />
        <div className="md-help">
          <span>Markdown supported: **bold**, _italic_, # heading, - list, - [ ] todo, `code`, [link](url)</span>
          <span>Click outside or ⌘/Ctrl+Enter to save</span>
        </div>
      </div>
    );
  return (
    <div className="md-field" onClick={(e) => { if (e.target.tagName !== 'A') setEditing(true); }}>
      {value ? <Markdown text={value} /> : <span className="placeholder">{placeholder}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- date field */
/** Shows a friendly date ("Nov 10") and opens the native picker on click/tap. */
export function DateField({ value, onChange, withTime, placeholder = 'Add date', overdue }) {
  const ref = useRef(null);
  const v = value ? (withTime ? String(value).slice(0, 16) : String(value).slice(0, 10)) : '';
  const label = v ? (withTime ? fmtDateTime(v) : fmtDate(v, { relative: false })) : placeholder;
  const open = () => { try { ref.current?.showPicker?.(); } catch {} };
  return (
    <span className="date-field">
      <span className={`date-display${v ? '' : ' empty'}${overdue ? ' overdue' : ''}`} onClick={open}>
        <CalendarDays size={14} />
        <span>{label}</span>
        <input
          ref={ref}
          className="date-native"
          type={withTime ? 'datetime-local' : 'date'}
          value={v}
          onChange={(e) => onChange(e.target.value || null)}
          onClick={(e) => { e.stopPropagation(); open(); }}
          aria-label={placeholder}
        />
      </span>
      {v && (
        <button className="icon-btn sm" title="Clear date" aria-label="Clear date" onClick={(e) => { e.stopPropagation(); onChange(null); }}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- emoji picker */
const EMOJIS = ['📁','⭐','🛡️','🍽️','🚀','📈','💼','🎯','🧠','📣','🏫','🏢','🛠️','💡','📊','🗂️','📌','📄','📝','📅','🤝','💬','🎉','🔥','✅','⚡','🌱','🧾','💰','🏆','🎓','🌍','📦','🔒','🧩','🎨','📷','🎤','🗓️','🧭'];
export function EmojiPicker({ anchor, onClose, onPick }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => { onPick(e); onClose(); }}>{e}</button>
        ))}
      </div>
    </Popover>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="search-box">
      <Search size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button className="icon-btn sm" onClick={() => onChange('')}><X size={12} /></button>}
    </label>
  );
}

export function Prop({ icon, label, children, onClick, static: isStatic }) {
  return (
    <div className="prop">
      <div className="prop-label">{icon}{label}</div>
      <div className={`prop-value${isStatic ? ' static' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- project icon (emoji or uploaded image) */
export function ProjectIcon({ project, size = '1.2em', className = '' }) {
  if (!project) return null;
  if (project.icon_image) return <img className={`proj-icon ${className}`} src={project.icon_image} style={{ width: size, height: size }} alt="" draggable={false} />;
  return <span className={className}>{project.icon}</span>;
}
/** Plain-text label for places that can't show an image (menus, titles). */
export const projectLabel = (p) => (p ? (p.icon_image ? p.name : `${p.icon} ${p.name}`) : '');

/** Shrink an image file to a 128×128 PNG data URL (keeps the whole image, transparent padding). */
export function imageFileToIcon(file, px = 128) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file (PNG, JPG, SVG…)'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('That image is over 10 MB — please pick a smaller one'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(px / (img.naturalWidth || px), px / (img.naturalHeight || px));
      const w = Math.max(1, Math.round((img.naturalWidth || px) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || px) * scale));
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

/** Icon picker for a project: pick an emoji or upload your own image (PNG/JPG/SVG/WebP). */
export function ProjectIconField({ icon, image, onChange, onError }) {
  const [a, open, close] = useAnchor();
  const fileRef = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    try { onChange({ icon_image: await imageFileToIcon(file) }); } catch (e) { onError?.(e.message); }
  };
  return (
    <div className="icon-field">
      <button type="button" className="icon-tile" onClick={open} title="Choose an emoji" aria-label="Choose an emoji icon">
        {image ? <img src={image} alt="Project icon" /> : icon}
      </button>
      <div className="icon-field-actions">
        <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>{image ? 'Change image' : 'Upload image'}</button>
        {image && <button type="button" className="link-btn muted-link" onClick={() => onChange({ icon_image: null })}>Use emoji</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      <EmojiPicker anchor={a} onClose={close} onPick={(emoji) => onChange({ icon: emoji, icon_image: null })} />
    </div>
  );
}
