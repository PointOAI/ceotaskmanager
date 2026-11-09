import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useApp } from './App';
import { SelectMenu, StatusTag, Tag, Person, useAnchor, Avatar, PriorityLabel } from './ui';
import { PRIORITIES, tagColor, fmtDateTime } from './lib';

/** Users who can be assigned in a project: its members plus admins. */
export function useProjectPeople(project) {
  const { users } = useApp();
  return useMemo(
    () => users.filter((u) => u.active && (u.role === 'admin' || project?.member_ids?.includes(u.id))),
    [users, project]
  );
}

export function StatusPicker({ statuses, value, onChange, children, className = 'prop-value' }) {
  const [a, open, close] = useAnchor();
  const cur = statuses.find((s) => s.id === value);
  return (
    <>
      <div className={className} role="button" onClick={open}>{children || <StatusTag status={cur} />}</div>
      <SelectMenu
        anchor={a}
        onClose={close}
        value={value}
        onChange={onChange}
        options={statuses.map((s) => ({ value: s.id, label: s.name, render: <StatusTag status={s} /> }))}
      />
    </>
  );
}

export function PriorityPicker({ value, onChange, className = 'prop-value', empty = 'Empty' }) {
  const [a, open, close] = useAnchor();
  return (
    <>
      <div className={className} role="button" onClick={open}>
        <PriorityLabel value={value} empty={empty} />
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        searchable={false}
        value={value}
        onChange={onChange}
        options={PRIORITIES.map((p) => ({ value: p.value, label: p.value, render: <PriorityLabel value={p.value} /> }))}
      />
    </>
  );
}

export function UserPicker({ people, value, onChange, className = 'prop-value', empty = 'Empty', compact }) {
  const { userMap } = useApp();
  const [a, open, close] = useAnchor();
  const cur = userMap[value];
  return (
    <>
      <div className={className} role="button" onClick={open}>
        {compact ? (cur ? <Avatar user={cur} /> : <span className="empty">—</span>) : <Person user={cur} empty={empty} />}
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        allowClear={!!value}
        value={value}
        onChange={onChange}
        placeholder="Search people…"
        options={people.map((u) => ({ value: u.id, label: u.display_name, render: <Person user={u} /> }))}
      />
    </>
  );
}

export function MultiUserPicker({ people, value = [], onChange, className = 'prop-value', empty = 'Empty' }) {
  const { userMap } = useApp();
  const [a, open, close] = useAnchor();
  return (
    <>
      <div className={className} role="button" onClick={open}>
        {value.length ? value.map((id) => userMap[id] && <Person key={id} user={userMap[id]} />).reduce((acc, el, i) => (i ? [...acc, <span key={'s' + i} className="faint">,</span>, el] : [el]), []) : <span className="empty">{empty}</span>}
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        multi
        value={value}
        onChange={onChange}
        placeholder="Search people…"
        options={people.map((u) => ({ value: u.id, label: u.display_name, render: <Person user={u} /> }))}
      />
    </>
  );
}

export function TagsPicker({ value = [], allTags = [], onChange, className = 'prop-value', empty = 'Empty' }) {
  const [a, open, close] = useAnchor();
  const options = [...new Set([...allTags, ...value])].sort().map((t) => ({ value: t, label: t, render: <Tag color={tagColor(t)}>{t}</Tag> }));
  return (
    <>
      <div className={className} role="button" onClick={open}>
        {value.length ? value.map((t) => <Tag key={t} color={tagColor(t)}>{t}</Tag>) : <span className="empty">{empty}</span>}
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        multi
        value={value}
        onChange={onChange}
        onCreate={(t) => onChange([...value, t])}
        options={options}
      />
    </>
  );
}

export function MeetingPicker({ projectId, value, title, onChange, className = 'prop-value' }) {
  const [a, open, close] = useAnchor();
  const [meetings, setMeetings] = useState([]);
  useEffect(() => { if (a) api.get(`/projects/${projectId}/meetings`).then(setMeetings).catch(() => {}); }, [a, projectId]);
  return (
    <>
      <div className={className} role="button" onClick={open}>
        {value ? <span className="flex" style={{ gap: 6 }}>🗓️ <span className="ellipsis">{title || 'Meeting'}</span></span> : <span className="empty">Not linked</span>}
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        allowClear={!!value}
        value={value}
        onChange={onChange}
        width={300}
        placeholder="Search meetings…"
        options={meetings.map((m) => ({
          value: m.id,
          label: m.title,
          render: (
            <span className="flex" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span className="ellipsis">{m.title}</span>
              <span className="faint small">{m.date ? fmtDateTime(m.date) : ''}</span>
            </span>
          ),
        }))}
      />
    </>
  );
}

export function OptionPicker({ options, value, onChange, className = 'prop-value', empty = 'Empty' }) {
  const [a, open, close] = useAnchor();
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, color: 'gray' } : o));
  const cur = norm.find((o) => o.value === value);
  return (
    <>
      <div className={className} role="button" onClick={open}>
        {cur ? <Tag color={cur.color}>{cur.value}</Tag> : value ? <Tag>{value}</Tag> : <span className="empty">{empty}</span>}
      </div>
      <SelectMenu
        anchor={a}
        onClose={close}
        searchable={norm.length > 6}
        value={value}
        onChange={onChange}
        options={norm.map((o) => ({ value: o.value, label: o.value, render: <Tag color={o.color}>{o.value}</Tag> }))}
      />
    </>
  );
}
