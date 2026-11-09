import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Eye, Pencil } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { Markdown, EmojiPicker, useAnchor, TitleInput, AutoTextarea, Empty, Menu } from '../ui';
import { timeAgo } from '../lib';

const TEMPLATES = [
  { title: 'Blank page', icon: '📄', content: '' },
  { title: 'Project brief', icon: '📌', content: '## Goal\n\n## Background\n\n## Scope\n- In:\n- Out:\n\n## Success metrics\n- Metric and target\n\n## Timeline\n| Milestone | Date |\n|---|---|\n|  |  |\n' },
  { title: 'Process / SOP', icon: '🛠️', content: '## Purpose\n\n## When to use\n\n## Steps\n1. First step\n2. Second step\n3. Third step\n\n## Owner\n' },
  { title: 'Weekly update', icon: '📈', content: '## Highlights\n- Add a highlight\n\n## Progress\n- What moved forward\n\n## Risks / blockers\n- Anything slowing us down\n\n## Next week\n- [ ] First priority\n' },
];

export default function Docs({ project }) {
  const { sub } = useParams();
  const navigate = useNavigate();
  const { userMap, toast, confirm, version } = useApp();
  const [pages, setPages] = useState(null);
  const [page, setPage] = useState(null);
  const [mode, setMode] = useState('view');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState('');
  const [iconAnchor, openIcon, closeIcon] = useAnchor();
  const [tplAnchor, openTpl, closeTpl] = useAnchor();
  const timer = useRef();
  const editNext = useRef(null);

  const loadList = () => api.get(`/projects/${project.id}/pages`).then(setPages);
  useEffect(() => { loadList(); }, [project.id, version]); // eslint-disable-line
  useEffect(() => {
    if (!pages) return;
    if (!sub && pages.length) { navigate(`/p/${project.id}/docs/${pages[0].id}`, { replace: true }); return; }
    if (!sub) { setPage(null); return; }
    api.get(`/pages/${sub}`).then((p) => { setPage(p); setContent(p.content || ''); setMode(!p.content || editNext.current === p.id ? 'edit' : 'view'); editNext.current = null; }).catch(() => setPage(null));
  }, [sub, pages === null]); // eslint-disable-line

  const save = async (patch) => {
    setSaving('Saving…');
    try {
      const p = await api.patch(`/pages/${page.id}`, patch);
      setPage(p);
      setPages((list) => list.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      setSaving('Saved');
      setTimeout(() => setSaving(''), 1200);
    } catch (e) { toast(e.message, 'error'); setSaving(''); }
  };
  const onType = (v) => {
    setContent(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ content: v }), 700);
  };
  const create = async (tpl) => {
    const p = await api.post(`/projects/${project.id}/pages`, { title: tpl.title === 'Blank page' ? 'Untitled' : tpl.title, icon: tpl.icon, content: tpl.content });
    editNext.current = p.id;
    await loadList();
    navigate(`/p/${project.id}/docs/${p.id}`);
    setPage(p);
    setContent(p.content);
    setMode('edit');
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${page.title}”?`, message: 'This page will be permanently deleted.', danger: true, confirmText: 'Delete' }))) return;
    await api.del(`/pages/${page.id}`);
    const rest = pages.filter((p) => p.id !== page.id);
    setPages(rest);
    navigate(rest.length ? `/p/${project.id}/docs/${rest[0].id}` : `/p/${project.id}/docs`);
  };

  if (!pages) return <div className="empty-state">Loading…</div>;
  return (
    <div className="docs">
      <div className="docs-list">
        <button className="nav-item" style={{ color: 'var(--text-2)' }} onClick={openTpl}><Plus size={15} /> New page</button>
        <div className="nav-section" style={{ paddingTop: 8 }}>Pages</div>
        {pages.map((p) => (
          <button key={p.id} className={`nav-item${page?.id === p.id ? ' active' : ''}`} onClick={() => navigate(`/p/${project.id}/docs/${p.id}`)}>
            <span className="emoji">{p.icon}</span><span className="label">{p.title}</span>
          </button>
        ))}
      </div>
      <EmojiTpl anchor={tplAnchor} onClose={closeTpl} onPick={create} />
      <div className="docs-main">
        {!page ? (
          <Empty icon="📚" title="Team docs" text="Write briefs, SOPs, notes and anything the team should know." action={<button className="btn primary" onClick={openTpl}><Plus size={15} /> New page</button>} />
        ) : (
          <>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <button className="doc-icon-btn" onClick={openIcon}>{page.icon}</button>
              <div className="flex">
                <span className="faint small">{saving || `Edited ${timeAgo(page.updated_at)} by ${userMap[page.updated_by]?.display_name || '—'}`}</span>
                <div className="seg">
                  <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}><Eye size={13} /> View</button>
                  <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}><Pencil size={13} /> Edit</button>
                </div>
                <button className="icon-btn" title="Delete page" onClick={remove}><Trash2 size={15} /></button>
              </div>
            </div>
            <EmojiPicker anchor={iconAnchor} onClose={closeIcon} onPick={(icon) => save({ icon })} />
            <TitleInput value={page.title} onSave={(title) => save({ title })} className="title-input" />
            <div style={{ marginTop: 14 }}>
              {mode === 'edit' ? (
                <>
                  <AutoTextarea className="doc-editor" autoFocus placeholder="Start writing… Markdown supported: # Heading, - list, - [ ] todo, **bold**, | tables |" value={content} onChange={(e) => onType(e.target.value)} />
                </>
              ) : content ? (
                <div onDoubleClick={() => setMode('edit')} style={{ fontSize: 15 }}><Markdown text={content} /></div>
              ) : (
                <div className="faint" style={{ cursor: 'text' }} onClick={() => setMode('edit')}>Empty page — click to start writing.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmojiTpl({ anchor, onClose, onPick }) {
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      items={[{ label: 'Start from' }, ...TEMPLATES.map((t) => ({ label: t.title, icon: <span>{t.icon}</span>, onClick: () => onPick(t) }))]}
    />
  );
}

