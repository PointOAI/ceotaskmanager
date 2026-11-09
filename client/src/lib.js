export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

export const PRIORITIES = [
  { value: 'Urgent', color: 'red' },
  { value: 'High', color: 'orange' },
  { value: 'Medium', color: 'yellow' },
  { value: 'Low', color: 'gray' },
];
export const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
export const priorityColor = (p) => PRIORITIES.find((x) => x.value === p)?.color || 'gray';

export const CONTACT_STAGES = [
  { value: 'Lead', color: 'gray' },
  { value: 'Contacted', color: 'blue' },
  { value: 'In discussion', color: 'yellow' },
  { value: 'Partner', color: 'green' },
  { value: 'Client', color: 'purple' },
  { value: 'Inactive', color: 'brown' },
];
export const CHANNELS = ['Call', 'Email', 'Meeting', 'Text / WhatsApp', 'Video call', 'In person', 'Other'];
export const EVENT_STATUSES = [
  { value: 'Planned', color: 'gray' },
  { value: 'Confirmed', color: 'blue' },
  { value: 'Completed', color: 'green' },
  { value: 'Cancelled', color: 'red' },
];
export const EVENT_CATEGORIES = ['General', 'Marketing', 'Workshop', 'Conference', 'Launch', 'Community', 'Internal'];
export const MEETING_STATUSES = [
  { value: 'Scheduled', color: 'blue' },
  { value: 'Completed', color: 'green' },
  { value: 'Cancelled', color: 'red' },
];
export const MEETING_TYPES = ['Internal', 'Client', 'Partner', 'Vendor', '1:1', 'Standup', 'Review'];

export function tagColor(tag) {
  let h = 0;
  for (const ch of String(tag)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const pad = (n) => String(n).padStart(2, '0');
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISODate(new Date());
export const addDays = (iso, n) => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
export function parseLocal(s) {
  if (!s) return null;
  const [date, time] = String(s).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
export const parseServer = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(s, { relative = true } = {}) {
  if (!s) return '';
  const iso = String(s).slice(0, 10);
  if (relative) {
    const t = todayISO();
    if (iso === t) return 'Today';
    if (iso === addDays(t, 1)) return 'Tomorrow';
    if (iso === addDays(t, -1)) return 'Yesterday';
  }
  const d = parseLocal(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : ', ' + d.getFullYear()}`;
}
export function fmtTime(s) {
  if (!s || !String(s).includes('T')) return '';
  const d = parseLocal(s);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}
export function fmtDateTime(s) {
  if (!s) return '';
  const t = fmtTime(s);
  return t ? `${fmtDate(s)}, ${t}` : fmtDate(s);
}
export function timeAgo(serverTs) {
  const d = parseServer(serverTs);
  if (!d) return '';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(toISODate(d), { relative: false });
}
export const isOverdue = (iso) => !!iso && String(iso).slice(0, 10) < todayISO();
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export function fmtSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
