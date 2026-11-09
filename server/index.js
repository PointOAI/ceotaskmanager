const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { db, createProject, ATTACHMENTS_DIR } = require('./db');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { if (!req.body) req.body = {}; next(); });

const PORT = process.env.PORT || 4000;
const SESSION_DAYS = 30;

// ---------------------------------------------------------------- helpers
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const parseJSON = (s, d) => {
  try { return s ? JSON.parse(s) : d; } catch { return d; }
};
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { next(e); }
};
const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
};
const nullIfEmpty = (v) => (v === '' || v === undefined ? null : v);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const h = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === h.length && crypto.timingSafeEqual(h, stored);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), userId);
  return token;
}
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  title: u.title,
  role: u.role,
  color: u.color,
  active: !!u.active,
  has_password: !!u.password_hash,
  last_login: u.last_login,
  created_at: u.created_at,
});
function validPassword(p) {
  if (typeof p !== 'string' || p.length < 8) fail(400, 'Password must be at least 8 characters');
}

function logActivity({ project_id, ticket_id = null, user_id, entity, entity_id = null, action, detail = '' }) {
  db.prepare(
    'INSERT INTO activity (project_id, ticket_id, user_id, entity, entity_id, action, detail) VALUES (?,?,?,?,?,?,?)'
  ).run(project_id, ticket_id, user_id, entity, entity_id, action, detail);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return m ? `${MONTHS[m - 1]} ${d}, ${y}` : iso; };
// type: assign | comment | mention | status | update | attachment | subtask | meeting | project | general
function notify(userId, actorId, message, link, type = 'general') {
  if (!userId || userId === actorId) return;
  db.prepare('INSERT INTO notifications (user_id, actor_id, message, link, type) VALUES (?,?,?,?,?)').run(userId, actorId, message, link, type);
}
/** Notify each distinct user once (skips empty ids and the person who did it). */
const notifyAll = (userIds, actorId, message, link, type) => new Set(userIds.filter(Boolean)).forEach((uid) => notify(uid, actorId, message, link, type));

// ---------------------------------------------------------------- auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || new Date(s.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  if (!u || !u.active) return res.status(401).json({ error: 'Account disabled' });
  req.user = u;
  req.token = token;
  next();
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function accessibleProjectIds(user) {
  if (user.role === 'admin') return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  return db.prepare('SELECT project_id AS id FROM project_members WHERE user_id = ?').all(user.id).map((r) => r.id);
}
function assertProject(user, projectId) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!p) fail(404, 'Project not found');
  if (user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, user.id);
    if (!m) fail(403, 'You do not have access to this project');
  }
  return p;
}
function loadOwned(user, table, id) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) fail(404, 'Not found');
  assertProject(user, row.project_id);
  return row;
}
const inList = (ids) => (ids.length ? ids.join(',') : '0');

// ---------------------------------------------------------------- AUTH ROUTES
app.post('/api/auth/check', wrap((req) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
  if (!u || !u.active) fail(404, 'No account found with that user ID. Ask your admin for access.');
  return { username: u.username, display_name: u.display_name, needs_password: !u.password_hash };
}));

app.post('/api/auth/setup', wrap((req) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!u || !u.active) fail(404, 'No account found');
  if (u.password_hash) fail(400, 'Password already set. Please sign in.');
  validPassword(password);
  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, u.id);
  return { token: createSession(u.id), user: publicUser({ ...u, password_hash: hash }) };
}));

app.post('/api/auth/login', wrap((req) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!u || !u.active || !u.password_hash || !verifyPassword(String(password || ''), u.password_hash, u.password_salt))
    fail(401, 'Incorrect user ID or password');
  return { token: createSession(u.id), user: publicUser(u) };
}));

app.use('/api', auth);

app.post('/api/auth/logout', wrap((req) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  return { ok: true };
}));
app.get('/api/auth/me', wrap((req) => publicUser(req.user)));
app.patch('/api/auth/me', wrap((req) => {
  const f = pick(req.body, ['display_name', 'title', 'color']);
  if (f.display_name !== undefined && !String(f.display_name).trim()) fail(400, 'Name is required');
  const keys = Object.keys(f);
  if (keys.length)
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), req.user.id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
}));
app.post('/api/auth/change-password', wrap((req) => {
  const { current, password } = req.body;
  if (!verifyPassword(String(current || ''), req.user.password_hash, req.user.password_salt)) fail(400, 'Current password is incorrect');
  validPassword(password);
  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
  return { ok: true };
}));

// ---------------------------------------------------------------- USERS (admin)
app.get('/api/users', wrap(() => db.prepare('SELECT * FROM users ORDER BY display_name').all().map(publicUser)));

app.post('/api/users', adminOnly, wrap((req) => {
  const username = String(req.body.username || '').trim();
  const display_name = String(req.body.display_name || '').trim() || username;
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) fail(400, 'User ID must be 3–32 characters: letters, numbers, dot, dash or underscore');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) fail(400, 'That user ID is already taken');
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  const colors = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown'];
  const color = req.body.color || colors[Math.floor(Math.random() * colors.length)];
  let hash = null, salt = null;
  if (req.body.password) {
    validPassword(req.body.password);
    ({ hash, salt } = hashPassword(req.body.password));
  }
  const id = db
    .prepare('INSERT INTO users (username, display_name, title, role, color, password_hash, password_salt) VALUES (?,?,?,?,?,?,?)')
    .run(username, display_name, req.body.title || '', role, color, hash, salt).lastInsertRowid;
  const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)');
  for (const pid of req.body.project_ids || []) ins.run(pid, id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}));

app.patch('/api/users/:id', adminOnly, wrap((req) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) fail(404, 'User not found');
  const f = pick(req.body, ['display_name', 'title', 'role', 'color', 'active']);
  if (u.id === req.user.id && (f.role === 'member' || f.active === false)) fail(400, 'You cannot remove your own admin access or deactivate yourself');
  if (f.active !== undefined) f.active = f.active ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length)
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), u.id);
  if (f.active === 0) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
}));

// Clears the password: the user sets a new one the next time they sign in with their user ID.
app.post('/api/users/:id/reset-password', adminOnly, wrap((req) => {
  db.prepare('UPDATE users SET password_hash = NULL, password_salt = NULL WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  return { ok: true };
}));

app.get('/api/users/:id/projects', adminOnly, wrap((req) =>
  db.prepare('SELECT project_id FROM project_members WHERE user_id = ?').all(req.params.id).map((r) => r.project_id)
));
app.put('/api/users/:id/projects', adminOnly, wrap((req) => {
  const ids = (req.body.project_ids || []).map(Number);
  db.transaction(() => {
    db.prepare('DELETE FROM project_members WHERE user_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?,?)');
    ids.forEach((pid) => ins.run(pid, req.params.id));
  })();
  return ids;
}));

// ---------------------------------------------------------------- PROJECTS
// Project icon images are small PNG/JPEG/WebP/GIF data URLs (the browser resizes them to 128px before upload).
function checkIconImage(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) fail(400, 'The icon must be a PNG, JPG, WebP or GIF image');
  if (v.length > 400000) fail(400, 'The icon image is too large');
  return v;
}

function projectSummary(p) {
  const counts = db
    .prepare(
      `SELECT COUNT(*) total, SUM(CASE WHEN s.is_done = 1 THEN 1 ELSE 0 END) done
       FROM tickets t LEFT JOIN statuses s ON s.id = t.status_id WHERE t.project_id = ?`
    )
    .get(p.id);
  const members = db.prepare('SELECT user_id FROM project_members WHERE project_id = ?').all(p.id).map((r) => r.user_id);
  const statuses = db.prepare('SELECT * FROM statuses WHERE project_id = ? ORDER BY position, id').all(p.id);
  return { ...p, archived: !!p.archived, ticket_total: counts.total || 0, ticket_done: counts.done || 0, member_ids: members, statuses };
}

app.get('/api/projects', wrap((req) => {
  const ids = accessibleProjectIds(req.user);
  return db.prepare(`SELECT * FROM projects WHERE id IN (${inList(ids)}) ORDER BY archived, id`).all().map(projectSummary);
}));

app.post('/api/projects', adminOnly, wrap((req) => {
  const name = String(req.body.name || '').trim();
  if (!name) fail(400, 'Project name is required');
  let key = String(req.body.key || name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase().slice(0, 6) || 'PRJ';
  let base = key, i = 1;
  while (db.prepare('SELECT 1 FROM projects WHERE key = ?').get(key)) key = `${base}${i++}`;
  const iconImage = checkIconImage(req.body.icon_image);
  const pid = createProject({ name, key, icon: req.body.icon, color: req.body.color, description: req.body.description, created_by: req.user.id });
  if (iconImage) db.prepare('UPDATE projects SET icon_image = ? WHERE id = ?').run(iconImage, pid);
  const members = new Set([req.user.id, ...(req.body.member_ids || []).map(Number)]);
  const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)');
  members.forEach((uid) => ins.run(pid, uid));
  logActivity({ project_id: pid, user_id: req.user.id, entity: 'project', entity_id: pid, action: 'created the project' });
  return projectSummary(db.prepare('SELECT * FROM projects WHERE id = ?').get(pid));
}));

app.get('/api/projects/:id', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return projectSummary(p);
}));

app.patch('/api/projects/:id', adminOnly, wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const f = pick(req.body, ['name', 'icon', 'icon_image', 'color', 'description', 'archived']);
  if (f.archived !== undefined) f.archived = f.archived ? 1 : 0;
  if ('icon_image' in f) f.icon_image = checkIconImage(f.icon_image);
  const keys = Object.keys(f);
  if (keys.length)
    db.prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), p.id);
  return projectSummary(db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id));
}));

app.delete('/api/projects/:id', adminOnly, wrap((req) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  return { ok: true };
}));

app.put('/api/projects/:id/members', adminOnly, wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const ids = [...new Set((req.body.member_ids || []).map(Number))];
  const before = db.prepare('SELECT user_id FROM project_members WHERE project_id = ?').all(p.id).map((r) => r.user_id);
  db.transaction(() => {
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(p.id);
    const ins = db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?,?)');
    ids.forEach((uid) => ins.run(p.id, uid));
  })();
  ids.filter((id) => !before.includes(id)).forEach((uid) =>
    notify(uid, req.user.id, `${req.user.display_name} added you to ${p.name}`, `/p/${p.id}`, 'project')
  );
  return projectSummary(db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id));
}));

// ---------------------------------------------------------------- STATUSES (custom columns)
app.post('/api/projects/:id/statuses', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) fail(400, 'Column name is required');
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM statuses WHERE project_id = ?').get(p.id).p;
  const id = db
    .prepare('INSERT INTO statuses (project_id, name, color, position, is_done) VALUES (?,?,?,?,?)')
    .run(p.id, name, req.body.color || 'gray', pos, req.body.is_done ? 1 : 0).lastInsertRowid;
  logActivity({ project_id: p.id, user_id: req.user.id, entity: 'status', entity_id: id, action: 'added column', detail: name });
  return db.prepare('SELECT * FROM statuses WHERE id = ?').get(id);
}));

app.patch('/api/statuses/:id', wrap((req) => {
  const s = loadOwned(req.user, 'statuses', req.params.id);
  const f = pick(req.body, ['name', 'color', 'is_done']);
  if (f.is_done !== undefined) f.is_done = f.is_done ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length)
    db.prepare(`UPDATE statuses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), s.id);
  return db.prepare('SELECT * FROM statuses WHERE id = ?').get(s.id);
}));

app.put('/api/projects/:id/statuses/order', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const upd = db.prepare('UPDATE statuses SET position = ? WHERE id = ? AND project_id = ?');
  db.transaction(() => (req.body.ids || []).forEach((id, i) => upd.run(i, id, p.id)))();
  return db.prepare('SELECT * FROM statuses WHERE project_id = ? ORDER BY position, id').all(p.id);
}));

app.delete('/api/statuses/:id', wrap((req) => {
  const s = loadOwned(req.user, 'statuses', req.params.id);
  const others = db.prepare('SELECT * FROM statuses WHERE project_id = ? AND id != ? ORDER BY position').all(s.project_id, s.id);
  if (!others.length) fail(400, 'A project needs at least one column');
  const wanted = Number(req.body?.move_to || req.query.move_to);
  const target = others.find((o) => o.id === wanted)?.id || others[0].id;
  db.prepare('UPDATE tickets SET status_id = ? WHERE status_id = ?').run(target, s.id);
  db.prepare('DELETE FROM statuses WHERE id = ?').run(s.id);
  logActivity({ project_id: s.project_id, user_id: req.user.id, entity: 'status', action: 'removed column', detail: s.name });
  return { ok: true };
}));

// ---------------------------------------------------------------- TICKETS
const TICKET_SELECT = `
  SELECT t.*, p.key AS project_key,
    (SELECT COUNT(*) FROM comments c WHERE c.ticket_id = t.id) AS comment_count,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id AND ci.done = 1) AS checklist_done,
    (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count,
    (SELECT COUNT(*) FROM tickets st WHERE st.parent_id = t.id) AS subtask_total,
    (SELECT COUNT(*) FROM tickets st JOIN statuses ss ON ss.id = st.status_id WHERE st.parent_id = t.id AND ss.is_done = 1) AS subtask_done,
    pt.number AS parent_number, pt.title AS parent_title,
    m.title AS meeting_title
  FROM tickets t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN tickets pt ON pt.id = t.parent_id
  LEFT JOIN meetings m ON m.id = t.meeting_id`;
const serializeTicket = (t) => {
  if (!t) return t;
  const { parent_number, parent_title, ...rest } = t;
  return {
    ...rest,
    tags: parseJSON(t.tags, []),
    key: `${t.project_key}-${t.number}`,
    parent: t.parent_id ? { id: t.parent_id, key: `${t.project_key}-${parent_number}`, title: parent_title } : null,
  };
};
const getTicket = (id) => serializeTicket(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(id));

app.get('/api/projects/:id/tickets', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  // History (archived done tickets) is a separate list: ?archived=1
  if (req.query.archived === '1')
    return db.prepare(`${TICKET_SELECT} WHERE t.project_id = ? AND t.archived_at IS NOT NULL ORDER BY t.archived_at DESC, t.id DESC`).all(p.id).map(serializeTicket);
  return db.prepare(`${TICKET_SELECT} WHERE t.project_id = ? AND t.archived_at IS NULL ORDER BY t.position, t.id`).all(p.id).map(serializeTicket);
}));

// ---- history: done tickets can be moved out of the board and restored later
function archiveTicket(user, t) {
  db.prepare('UPDATE tickets SET archived_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), t.id);
  logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: user.id, entity: 'ticket', entity_id: t.id, action: 'moved to history', detail: getTicket(t.id).key });
}
const isDoneStatus = (statusId) => !!db.prepare('SELECT is_done FROM statuses WHERE id = ?').get(statusId)?.is_done;
app.post('/api/tickets/:id/archive', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  if (t.archived_at) return getTicket(t.id);
  if (!isDoneStatus(t.status_id)) fail(400, 'Only done tickets can be moved to history');
  archiveTicket(req.user, t);
  return getTicket(t.id);
}));
app.post('/api/tickets/:id/restore', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  if (!t.archived_at) return getTicket(t.id);
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1024 AS p FROM tickets WHERE project_id = ? AND status_id IS ? AND archived_at IS NULL').get(t.project_id, t.status_id).p;
  db.prepare('UPDATE tickets SET archived_at = NULL, position = ?, updated_at = ? WHERE id = ?').run(pos, now(), t.id);
  if (req.body.status_id) {
    const s = db.prepare('SELECT * FROM statuses WHERE id = ? AND project_id = ?').get(req.body.status_id, t.project_id);
    if (!s) fail(400, 'Invalid status');
    db.prepare('UPDATE tickets SET status_id = ?, completed_at = ? WHERE id = ?').run(s.id, s.is_done ? t.completed_at || now() : null, t.id);
  }
  logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: req.user.id, entity: 'ticket', entity_id: t.id, action: 'restored from history', detail: getTicket(t.id).key });
  return getTicket(t.id);
}));
app.post('/api/projects/:id/archive-done', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const where = req.body.status_id ? 'AND t.status_id = ?' : '';
  const args = req.body.status_id ? [p.id, req.body.status_id] : [p.id];
  const rows = db.prepare(`SELECT t.* FROM tickets t JOIN statuses s ON s.id = t.status_id WHERE t.project_id = ? AND s.is_done = 1 AND t.archived_at IS NULL ${where}`).all(...args);
  db.transaction(() => rows.forEach((t) => archiveTicket(req.user, t)))();
  return { archived: rows.length, ids: rows.map((t) => t.id) };
}));

app.get('/api/projects/:id/tags', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const set = new Set();
  db.prepare('SELECT tags FROM tickets WHERE project_id = ?').all(p.id).forEach((r) => parseJSON(r.tags, []).forEach((t) => set.add(t)));
  return [...set].sort();
}));

app.get('/api/tickets/mine',wrap((req) => {
  const ids = accessibleProjectIds(req.user);
  return db
    .prepare(`${TICKET_SELECT} WHERE t.assignee_id = ? AND t.archived_at IS NULL AND t.project_id IN (${inList(ids)}) ORDER BY t.due_date IS NULL, t.due_date, t.id DESC`)
    .all(req.user.id)
    .map(serializeTicket);
}));

app.post('/api/projects/:id/tickets', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const title = String(req.body.title || '').trim();
  if (!title) fail(400, 'Title is required');
  let statusId = req.body.status_id;
  if (!statusId) statusId = db.prepare('SELECT id FROM statuses WHERE project_id = ? ORDER BY position LIMIT 1').get(p.id)?.id;
  const parentId = nullIfEmpty(req.body.parent_id);
  let parent = null;
  if (parentId) {
    parent = db.prepare('SELECT * FROM tickets WHERE id = ? AND project_id = ?').get(parentId, p.id);
    if (!parent) fail(400, 'Parent ticket not found in this project');
    if (parent.parent_id) fail(400, 'A sub-ticket cannot have its own sub-tickets');
  }
  const id = db.transaction(() => {
    db.prepare('UPDATE projects SET ticket_seq = ticket_seq + 1 WHERE id = ?').run(p.id);
    const number = db.prepare('SELECT ticket_seq FROM projects WHERE id = ?').get(p.id).ticket_seq;
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1024 AS p FROM tickets WHERE project_id = ?').get(p.id).p;
    return db
      .prepare(
        `INSERT INTO tickets (project_id, number, title, body, status_id, priority, assignee_id, reporter_id, start_date, due_date, tags, meeting_id, estimate, position, parent_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        p.id, number, title, req.body.body || '', statusId, req.body.priority || 'Medium',
        nullIfEmpty(req.body.assignee_id), req.user.id, nullIfEmpty(req.body.start_date), nullIfEmpty(req.body.due_date),
        JSON.stringify(req.body.tags || []), nullIfEmpty(req.body.meeting_id), req.body.estimate || '', pos, parentId
      ).lastInsertRowid;
  })();
  const t = getTicket(id);
  logActivity({ project_id: p.id, ticket_id: id, user_id: req.user.id, entity: 'ticket', entity_id: id, action: parent ? 'created sub-ticket' : 'created', detail: `${t.key} ${t.title}` });
  if (parent) logActivity({ project_id: p.id, ticket_id: parent.id, user_id: req.user.id, entity: 'ticket', entity_id: parent.id, action: 'added sub-ticket', detail: `${t.key} ${t.title}` });
  notify(t.assignee_id, req.user.id, `${req.user.display_name} assigned you ${t.key}: ${t.title}`, `/p/${p.id}/tickets?t=${id}`, 'assign');
  if (parent) {
    const pk = `${p.key}-${parent.number}`;
    notifyAll([parent.assignee_id, parent.reporter_id].filter((u) => u !== t.assignee_id), req.user.id, `${req.user.display_name} added sub-ticket ${t.key} to ${pk}: ${t.title}`, `/p/${p.id}/tickets?t=${id}`, 'subtask');
  }
  return t;
}));

app.get('/api/tickets/:id', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  return {
    ...getTicket(t.id),
    checklist: db.prepare('SELECT * FROM checklist_items WHERE ticket_id = ? ORDER BY position, id').all(t.id),
    comments: db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at, id').all(t.id),
    activity: db.prepare('SELECT * FROM activity WHERE ticket_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(t.id),
    attachments: db.prepare('SELECT id, ticket_id, user_id, filename, mime, size, created_at FROM attachments WHERE ticket_id = ? ORDER BY created_at, id').all(t.id),
    subtasks: db.prepare(`${TICKET_SELECT} WHERE t.parent_id = ? ORDER BY t.id`).all(t.id).map(serializeTicket),
  };
}));

const FIELD_LABELS = {
  title: 'title', body: 'description', status_id: 'status', priority: 'priority', assignee_id: 'assignee',
  start_date: 'start date', due_date: 'due date', tags: 'labels', meeting_id: 'linked meeting', estimate: 'estimate',
  reporter_id: 'reporter',
};

app.patch('/api/tickets/:id', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  const f = pick(req.body, ['title', 'body', 'status_id', 'priority', 'assignee_id', 'reporter_id', 'start_date', 'due_date', 'tags', 'meeting_id', 'estimate', 'position']);
  if (f.title !== undefined && !String(f.title).trim()) fail(400, 'Title cannot be empty');
  ['assignee_id', 'reporter_id', 'start_date', 'due_date', 'meeting_id', 'status_id'].forEach((k) => { if (k in f) f[k] = nullIfEmpty(f[k]); });
  if (f.tags !== undefined) f.tags = JSON.stringify(f.tags || []);
  if (f.status_id !== undefined && f.status_id !== t.status_id) {
    const s = db.prepare('SELECT * FROM statuses WHERE id = ? AND project_id = ?').get(f.status_id, t.project_id);
    if (!s) fail(400, 'Invalid status');
    f.completed_at = s.is_done ? now() : null;
    if (!s.is_done && t.archived_at) f.archived_at = null; // reopening a ticket brings it back from history
  }
  const keys = Object.keys(f);
  if (!keys.length) return getTicket(t.id);
  db.prepare(`UPDATE tickets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k]), now(), t.id);

  const after = getTicket(t.id);
  const key = after.key;
  for (const k of keys) {
    if (!FIELD_LABELS[k] || String(t[k] ?? '') === String(f[k] ?? '')) continue;
    let detail = '';
    if (k === 'status_id') detail = db.prepare('SELECT name FROM statuses WHERE id = ?').get(f[k])?.name || '';
    else if (k === 'assignee_id' || k === 'reporter_id') detail = f[k] ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(f[k])?.display_name : k === 'assignee_id' ? 'Unassigned' : 'none';
    else if (k === 'priority' || k === 'due_date' || k === 'start_date' || k === 'estimate') detail = f[k] || 'none';
    else if (k === 'title') detail = f[k];
    logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: req.user.id, entity: 'ticket', entity_id: t.id, action: `changed ${FIELD_LABELS[k]}`, detail: `${key}${detail ? ' → ' + detail : ''}` });
  }
  const link = `/p/${t.project_id}/tickets?t=${t.id}`;
  if ('assignee_id' in f && f.assignee_id && Number(f.assignee_id) !== t.assignee_id)
    notify(Number(f.assignee_id), req.user.id, `${req.user.display_name} assigned you ${key}: ${after.title}`, link, 'assign');
  if ('status_id' in f && f.status_id !== t.status_id) {
    const sname = db.prepare('SELECT name FROM statuses WHERE id = ?').get(f.status_id)?.name;
    const msg = `${req.user.display_name} moved ${key} to ${sname}`;
    notifyAll([after.assignee_id, after.reporter_id], req.user.id, msg, link, 'status');
  }
  // Let the assignee know when someone else moves their deadline or priority.
  const assigneeChanged = 'assignee_id' in f && Number(f.assignee_id) !== t.assignee_id;
  if (!assigneeChanged) {
    if ('due_date' in f && String(f.due_date ?? '') !== String(t.due_date ?? ''))
      notify(after.assignee_id, req.user.id, `${req.user.display_name} ${f.due_date ? `changed the due date of ${key} to ${shortDate(f.due_date)}` : `removed the due date of ${key}`}`, link, 'update');
    if ('priority' in f && f.priority !== t.priority)
      notify(after.assignee_id, req.user.id, `${req.user.display_name} changed the priority of ${key} to ${f.priority}`, link, 'update');
  }
  return after;
}));

app.delete('/api/tickets/:id', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  const full = getTicket(t.id);
  const files = db.prepare('SELECT stored_name FROM attachments WHERE ticket_id = ?').all(t.id);
  db.prepare('DELETE FROM tickets WHERE id = ?').run(t.id);
  files.forEach((f) => removeStoredFile(f.stored_name));
  logActivity({ project_id: t.project_id, user_id: req.user.id, entity: 'ticket', action: 'deleted', detail: `${full.key} ${full.title}` });
  return { ok: true };
}));

// checklist
app.post('/api/tickets/:id/checklist', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  const text = String(req.body.text || '').trim();
  if (!text) fail(400, 'Text is required');
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM checklist_items WHERE ticket_id = ?').get(t.id).p;
  const id = db.prepare('INSERT INTO checklist_items (ticket_id, text, position) VALUES (?,?,?)').run(t.id, text, pos).lastInsertRowid;
  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id);
}));
function loadChecklist(user, id) {
  const ci = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id);
  if (!ci) fail(404, 'Not found');
  loadOwned(user, 'tickets', ci.ticket_id);
  return ci;
}
app.patch('/api/checklist/:id', wrap((req) => {
  const ci = loadChecklist(req.user, req.params.id);
  const f = pick(req.body, ['text', 'done']);
  if (f.done !== undefined) f.done = f.done ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE checklist_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), ci.id);
  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(ci.id);
}));
app.delete('/api/checklist/:id', wrap((req) => {
  const ci = loadChecklist(req.user, req.params.id);
  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(ci.id);
  return { ok: true };
}));

// comments
app.post('/api/tickets/:id/comments', wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  const body = String(req.body.body || '').trim();
  if (!body) fail(400, 'Comment cannot be empty');
  const id = db.prepare('INSERT INTO comments (ticket_id, user_id, body) VALUES (?,?,?)').run(t.id, req.user.id, body).lastInsertRowid;
  const full = getTicket(t.id);
  const link = `/p/${t.project_id}/tickets?t=${t.id}`;
  logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: req.user.id, entity: 'comment', entity_id: id, action: 'commented on', detail: full.key });
  const notified = new Set();
  // @mentions
  for (const m of body.matchAll(/@([A-Za-z0-9._-]+)/g)) {
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get(m[1]);
    if (u && !notified.has(u.id)) {
      notified.add(u.id);
      notify(u.id, req.user.id, `${req.user.display_name} mentioned you on ${full.key}: ${full.title}`, link, 'mention');
    }
  }
  [full.assignee_id, full.reporter_id].forEach((uid) => {
    if (uid && !notified.has(uid)) {
      notified.add(uid);
      notify(uid, req.user.id, `${req.user.display_name} commented on ${full.key}: ${full.title}`, link, 'comment');
    }
  });
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
}));
function loadComment(user, id) {
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
  if (!c) fail(404, 'Not found');
  loadOwned(user, 'tickets', c.ticket_id);
  if (c.user_id !== user.id && user.role !== 'admin') fail(403, 'You can only change your own comments');
  return c;
}
app.patch('/api/comments/:id', wrap((req) => {
  const c = loadComment(req.user, req.params.id);
  const body = String(req.body.body || '').trim();
  if (!body) fail(400, 'Comment cannot be empty');
  db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body, now(), c.id);
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(c.id);
}));
app.delete('/api/comments/:id', wrap((req) => {
  const c = loadComment(req.user, req.params.id);
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  return { ok: true };
}));

// attachments — the browser sends the raw file bytes; the real name and type travel in headers
const MAX_UPLOAD_MB = 25;
// Types the browser may display inline; everything else is always served as a download.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|text\/plain|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm))$/;
const removeStoredFile = (name) => fs.promises.unlink(path.join(ATTACHMENTS_DIR, path.basename(name))).catch(() => {});
function loadAttachment(user, id) {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) fail(404, 'Attachment not found');
  const t = loadOwned(user, 'tickets', a.ticket_id);
  return { a, t };
}
app.post('/api/tickets/:id/attachments', express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` }), wrap((req) => {
  const t = loadOwned(req.user, 'tickets', req.params.id);
  if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, 'The file is empty');
  let filename = 'file';
  try { filename = decodeURIComponent(String(req.headers['x-file-name'] || 'file')); } catch {}
  filename = filename.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200).trim() || 'file';
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(req.headers['x-file-type'] || '') ? req.headers['x-file-type'] : 'application/octet-stream';
  const ext = path.extname(filename).replace(/[^.\w]/g, '').slice(0, 12);
  const stored = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(ATTACHMENTS_DIR, stored), req.body);
  const id = db
    .prepare('INSERT INTO attachments (ticket_id, user_id, filename, mime, size, stored_name) VALUES (?,?,?,?,?,?)')
    .run(t.id, req.user.id, filename, mime, req.body.length, stored).lastInsertRowid;
  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now(), t.id);
  logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: req.user.id, entity: 'attachment', entity_id: id, action: 'attached', detail: filename });
  const tk = getTicket(t.id);
  notifyAll([t.assignee_id, t.reporter_id], req.user.id, `${req.user.display_name} attached “${filename}” to ${tk.key}: ${tk.title}`, `/p/${t.project_id}/tickets?t=${t.id}`, 'attachment');
  return db.prepare('SELECT id, ticket_id, user_id, filename, mime, size, created_at FROM attachments WHERE id = ?').get(id);
}));
app.get('/api/attachments/:id/file', (req, res, next) => {
  try {
    const { a } = loadAttachment(req.user, req.params.id);
    const inline = INLINE_TYPES.test(a.mime);
    res.setHeader('Content-Type', inline ? a.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.sendFile(path.join(ATTACHMENTS_DIR, path.basename(a.stored_name)), (err) => err && !res.headersSent && next(new HttpError(404, 'File is missing')));
  } catch (e) { next(e); }
});
app.delete('/api/attachments/:id', wrap((req) => {
  const { a, t } = loadAttachment(req.user, req.params.id);
  if (a.user_id !== req.user.id && req.user.role !== 'admin') fail(403, 'Only the person who uploaded this file (or an admin) can delete it');
  db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
  removeStoredFile(a.stored_name);
  logActivity({ project_id: t.project_id, ticket_id: t.id, user_id: req.user.id, entity: 'attachment', entity_id: a.id, action: 'removed attachment', detail: a.filename });
  return { ok: true };
}));

// ---------------------------------------------------------------- COMMUNICATION (contacts + logs)
app.get('/api/projects/:id/contacts', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM communications m WHERE m.contact_id = c.id) AS comm_count,
        (SELECT MAX(date) FROM communications m WHERE m.contact_id = c.id) AS last_contacted,
        (SELECT MIN(next_date) FROM communications m WHERE m.contact_id = c.id AND m.next_date IS NOT NULL AND m.next_done = 0) AS next_followup
       FROM contacts c WHERE c.project_id = ? ORDER BY c.name COLLATE NOCASE`
    )
    .all(p.id);
}));
app.post('/api/projects/:id/contacts', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) fail(400, 'Name is required');
  const b = req.body;
  const id = db
    .prepare('INSERT INTO contacts (project_id, name, email, phone, company, role, stage, notes, owner_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(p.id, name, b.email || '', b.phone || '', b.company || '', b.role || '', b.stage || 'Lead', b.notes || '', nullIfEmpty(b.owner_id) ?? req.user.id, req.user.id).lastInsertRowid;
  logActivity({ project_id: p.id, user_id: req.user.id, entity: 'contact', entity_id: id, action: 'added contact', detail: name });
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}));
app.get('/api/contacts/:id', wrap((req) => {
  const c = loadOwned(req.user, 'contacts', req.params.id);
  return { ...c, communications: db.prepare('SELECT * FROM communications WHERE contact_id = ? ORDER BY date DESC, id DESC').all(c.id) };
}));
app.patch('/api/contacts/:id', wrap((req) => {
  const c = loadOwned(req.user, 'contacts', req.params.id);
  const f = pick(req.body, ['name', 'email', 'phone', 'company', 'role', 'stage', 'notes', 'owner_id']);
  if ('owner_id' in f) f.owner_id = nullIfEmpty(f.owner_id);
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE contacts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k]), now(), c.id);
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(c.id);
}));
app.delete('/api/contacts/:id', wrap((req) => {
  const c = loadOwned(req.user, 'contacts', req.params.id);
  db.prepare('DELETE FROM contacts WHERE id = ?').run(c.id);
  logActivity({ project_id: c.project_id, user_id: req.user.id, entity: 'contact', action: 'deleted contact', detail: c.name });
  return { ok: true };
}));

app.get('/api/projects/:id/communications', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db
    .prepare('SELECT m.*, c.name AS contact_name, c.company AS contact_company FROM communications m JOIN contacts c ON c.id = m.contact_id WHERE m.project_id = ? ORDER BY m.date DESC, m.id DESC')
    .all(p.id);
}));
app.post('/api/contacts/:id/communications', wrap((req) => {
  const c = loadOwned(req.user, 'contacts', req.params.id);
  const b = req.body;
  if (!b.date) fail(400, 'Date is required');
  const id = db
    .prepare('INSERT INTO communications (contact_id, project_id, date, channel, summary, outcome, next_date, next_action, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(c.id, c.project_id, b.date, b.channel || 'Call', b.summary || '', b.outcome || '', nullIfEmpty(b.next_date), b.next_action || '', req.user.id).lastInsertRowid;
  db.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(now(), c.id);
  logActivity({ project_id: c.project_id, user_id: req.user.id, entity: 'communication', entity_id: id, action: `logged a ${(b.channel || 'call').toLowerCase()} with`, detail: c.name });
  return db.prepare('SELECT * FROM communications WHERE id = ?').get(id);
}));
app.patch('/api/communications/:id', wrap((req) => {
  const m = loadOwned(req.user, 'communications', req.params.id);
  const f = pick(req.body, ['date', 'channel', 'summary', 'outcome', 'next_date', 'next_action', 'next_done']);
  if ('next_date' in f) f.next_date = nullIfEmpty(f.next_date);
  if ('next_done' in f) f.next_done = f.next_done ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE communications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), m.id);
  return db.prepare('SELECT * FROM communications WHERE id = ?').get(m.id);
}));
app.delete('/api/communications/:id', wrap((req) => {
  const m = loadOwned(req.user, 'communications', req.params.id);
  db.prepare('DELETE FROM communications WHERE id = ?').run(m.id);
  return { ok: true };
}));

// ---------------------------------------------------------------- EVENTS
app.get('/api/projects/:id/events', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY start').all(p.id);
}));
app.post('/api/projects/:id/events', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const b = req.body;
  if (!String(b.title || '').trim()) fail(400, 'Title is required');
  if (!b.start) fail(400, 'Event date is required');
  const id = db
    .prepare('INSERT INTO events (project_id, title, description, start, end, location, category, status, owner_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(p.id, b.title.trim(), b.description || '', b.start, nullIfEmpty(b.end), b.location || '', b.category || 'General', b.status || 'Planned', nullIfEmpty(b.owner_id) ?? req.user.id, req.user.id).lastInsertRowid;
  logActivity({ project_id: p.id, user_id: req.user.id, entity: 'event', entity_id: id, action: 'created event', detail: b.title });
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
}));
app.patch('/api/events/:id', wrap((req) => {
  const e = loadOwned(req.user, 'events', req.params.id);
  const f = pick(req.body, ['title', 'description', 'start', 'end', 'location', 'category', 'status', 'owner_id']);
  ['end', 'owner_id'].forEach((k) => { if (k in f) f[k] = nullIfEmpty(f[k]); });
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), e.id);
  return db.prepare('SELECT * FROM events WHERE id = ?').get(e.id);
}));
app.delete('/api/events/:id', wrap((req) => {
  const e = loadOwned(req.user, 'events', req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  logActivity({ project_id: e.project_id, user_id: req.user.id, entity: 'event', action: 'deleted event', detail: e.title });
  return { ok: true };
}));

// ---------------------------------------------------------------- MEETINGS
const serializeMeeting = (m) => m && {
  ...m,
  attendees: parseJSON(m.attendees, []),
  action_total: db.prepare('SELECT COUNT(*) c FROM tickets WHERE meeting_id = ?').get(m.id).c,
  action_done: db.prepare('SELECT COUNT(*) c FROM tickets t JOIN statuses s ON s.id = t.status_id WHERE t.meeting_id = ? AND s.is_done = 1').get(m.id).c,
};
app.get('/api/projects/:id/meetings', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db.prepare('SELECT * FROM meetings WHERE project_id = ? ORDER BY date DESC, id DESC').all(p.id).map(serializeMeeting);
}));
app.post('/api/projects/:id/meetings', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const b = req.body;
  if (!String(b.title || '').trim()) fail(400, 'Title is required');
  const id = db
    .prepare(
      `INSERT INTO meetings (project_id, title, agenda, date, duration, location, meeting_type, host_id, attendees, external_attendees, notes, decisions, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(p.id, b.title.trim(), b.agenda || '', nullIfEmpty(b.date), b.duration || 30, b.location || '', b.meeting_type || 'Internal',
      nullIfEmpty(b.host_id) ?? req.user.id, JSON.stringify(b.attendees || []), b.external_attendees || '', b.notes || '', b.decisions || '', b.status || 'Scheduled', req.user.id).lastInsertRowid;
  logActivity({ project_id: p.id, user_id: req.user.id, entity: 'meeting', entity_id: id, action: 'scheduled meeting', detail: b.title });
  for (const uid of b.attendees || [])
    notify(Number(uid), req.user.id, `${req.user.display_name} invited you to "${b.title}"`, `/p/${p.id}/meetings?m=${id}`, 'meeting');
  return serializeMeeting(db.prepare('SELECT * FROM meetings WHERE id = ?').get(id));
}));
app.get('/api/meetings/:id', wrap((req) => {
  const m = loadOwned(req.user, 'meetings', req.params.id);
  return {
    ...serializeMeeting(m),
    action_items: db.prepare(`${TICKET_SELECT} WHERE t.meeting_id = ? ORDER BY t.id`).all(m.id).map(serializeTicket),
  };
}));
app.patch('/api/meetings/:id', wrap((req) => {
  const m = loadOwned(req.user, 'meetings', req.params.id);
  const f = pick(req.body, ['title', 'agenda', 'date', 'duration', 'location', 'meeting_type', 'host_id', 'attendees', 'external_attendees', 'notes', 'decisions', 'status']);
  if ('attendees' in f) {
    const before = parseJSON(m.attendees, []);
    (f.attendees || []).filter((u) => !before.includes(u)).forEach((uid) =>
      notify(Number(uid), req.user.id, `${req.user.display_name} added you to meeting "${f.title || m.title}"`, `/p/${m.project_id}/meetings?m=${m.id}`, 'meeting')
    );
    f.attendees = JSON.stringify(f.attendees || []);
  }
  ['date', 'host_id'].forEach((k) => { if (k in f) f[k] = nullIfEmpty(f[k]); });
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE meetings SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k]), now(), m.id);
  if (f.status && f.status !== m.status)
    logActivity({ project_id: m.project_id, user_id: req.user.id, entity: 'meeting', entity_id: m.id, action: `marked meeting ${f.status.toLowerCase()}`, detail: m.title });
  return serializeMeeting(db.prepare('SELECT * FROM meetings WHERE id = ?').get(m.id));
}));
app.delete('/api/meetings/:id', wrap((req) => {
  const m = loadOwned(req.user, 'meetings', req.params.id);
  db.prepare('DELETE FROM meetings WHERE id = ?').run(m.id);
  logActivity({ project_id: m.project_id, user_id: req.user.id, entity: 'meeting', action: 'deleted meeting', detail: m.title });
  return { ok: true };
}));

// ---------------------------------------------------------------- DOCS (pages)
app.get('/api/projects/:id/pages', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db.prepare('SELECT id, project_id, title, icon, created_by, updated_by, created_at, updated_at FROM pages WHERE project_id = ? ORDER BY updated_at DESC').all(p.id);
}));
app.post('/api/projects/:id/pages', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  const id = db
    .prepare('INSERT INTO pages (project_id, title, icon, content, created_by, updated_by) VALUES (?,?,?,?,?,?)')
    .run(p.id, req.body.title || 'Untitled', req.body.icon || '📄', req.body.content || '', req.user.id, req.user.id).lastInsertRowid;
  logActivity({ project_id: p.id, user_id: req.user.id, entity: 'page', entity_id: id, action: 'created doc', detail: req.body.title || 'Untitled' });
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
}));
app.get('/api/pages/:id', wrap((req) => loadOwned(req.user, 'pages', req.params.id)));
app.patch('/api/pages/:id', wrap((req) => {
  const pg = loadOwned(req.user, 'pages', req.params.id);
  const f = pick(req.body, ['title', 'icon', 'content']);
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE pages SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k]), req.user.id, now(), pg.id);
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(pg.id);
}));
app.delete('/api/pages/:id', wrap((req) => {
  const pg = loadOwned(req.user, 'pages', req.params.id);
  db.prepare('DELETE FROM pages WHERE id = ?').run(pg.id);
  return { ok: true };
}));

// ---------------------------------------------------------------- ACTIVITY / NOTIFICATIONS
app.get('/api/projects/:id/activity', wrap((req) => {
  const p = assertProject(req.user, req.params.id);
  return db.prepare('SELECT * FROM activity WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 200').all(p.id);
}));
app.get('/api/notifications', wrap((req) =>
  db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(req.user.id)
));
app.get('/api/notifications/count', wrap((req) =>
  db.prepare('SELECT COUNT(*) AS unread, (SELECT MAX(id) FROM notifications WHERE user_id = ?) AS latest_id FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id, req.user.id)
));
app.post('/api/notifications/:id/unread', wrap((req) => {
  db.prepare('UPDATE notifications SET read = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
}));
app.post('/api/notifications/read-all', wrap((req) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  return { ok: true };
}));
app.post('/api/notifications/:id/read', wrap((req) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
}));

// ---------------------------------------------------------------- DASHBOARD / CALENDAR / SEARCH
app.get('/api/dashboard', wrap((req) => {
  const ids = inList(accessibleProjectIds(req.user));
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today || '') ? req.query.today : new Date().toISOString().slice(0, 10);
  const in7 = new Date(new Date(today).getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const myOpen = db
    .prepare(`${TICKET_SELECT} LEFT JOIN statuses s ON s.id = t.status_id WHERE t.assignee_id = ? AND t.project_id IN (${ids}) AND COALESCE(s.is_done,0) = 0 ORDER BY t.due_date IS NULL, t.due_date, t.id DESC`)
    .all(req.user.id).map(serializeTicket);
  const overdueAll = db
    .prepare(`${TICKET_SELECT} LEFT JOIN statuses s ON s.id = t.status_id WHERE t.project_id IN (${ids}) AND COALESCE(s.is_done,0) = 0 AND t.due_date IS NOT NULL AND t.due_date < ? ORDER BY t.due_date LIMIT 30`)
    .all(today).map(serializeTicket);
  const followups = db
    .prepare(`SELECT m.*, c.name AS contact_name, c.company AS contact_company FROM communications m JOIN contacts c ON c.id = m.contact_id
              WHERE m.project_id IN (${ids}) AND m.next_date IS NOT NULL AND m.next_done = 0 AND substr(m.next_date,1,10) <= ? ORDER BY m.next_date LIMIT 30`)
    .all(in7);
  const events = db.prepare(`SELECT * FROM events WHERE project_id IN (${ids}) AND substr(COALESCE(end, start),1,10) >= ? ORDER BY start LIMIT 10`).all(today);
  const meetings = db.prepare(`SELECT * FROM meetings WHERE project_id IN (${ids}) AND date IS NOT NULL AND substr(date,1,10) >= ? AND status != 'Cancelled' ORDER BY date LIMIT 10`).all(today).map(serializeMeeting);
  const activity = db.prepare(`SELECT * FROM activity WHERE project_id IN (${ids}) ORDER BY created_at DESC, id DESC LIMIT 25`).all();
  return { my_open: myOpen, overdue: overdueAll, followups, events, meetings, activity };
}));

app.get('/api/calendar', wrap((req) => {
  let ids = accessibleProjectIds(req.user);
  if (req.query.project) ids = ids.filter((i) => i === Number(req.query.project));
  const L = inList(ids);
  const from = req.query.from || '0000-00-00';
  const to = req.query.to || '9999-99-99';
  const items = [];
  db.prepare(`SELECT * FROM events WHERE project_id IN (${L}) AND substr(start,1,10) <= ? AND substr(COALESCE(end,start),1,10) >= ?`).all(to, from)
    .forEach((e) => items.push({ type: 'event', id: e.id, project_id: e.project_id, title: e.title, date: e.start, end: e.end, location: e.location }));
  db.prepare(`SELECT * FROM meetings WHERE project_id IN (${L}) AND date IS NOT NULL AND substr(date,1,10) BETWEEN ? AND ?`).all(from, to)
    .forEach((m) => items.push({ type: 'meeting', id: m.id, project_id: m.project_id, title: m.title, date: m.date, status: m.status }));
  db.prepare(`${TICKET_SELECT} LEFT JOIN statuses s ON s.id = t.status_id WHERE t.project_id IN (${L}) AND t.archived_at IS NULL AND t.due_date BETWEEN ? AND ?`).all(from, to)
    .forEach((t) => items.push({ type: 'ticket', id: t.id, project_id: t.project_id, title: `${t.project_key}-${t.number} ${t.title}`, date: t.due_date, done: !!t.completed_at }));
  db.prepare(`SELECT m.*, c.name AS contact_name FROM communications m JOIN contacts c ON c.id = m.contact_id WHERE m.project_id IN (${L}) AND m.next_date IS NOT NULL AND substr(m.next_date,1,10) BETWEEN ? AND ?`).all(from, to)
    .forEach((m) => items.push({ type: 'followup', id: m.id, contact_id: m.contact_id, project_id: m.project_id, title: `Follow up: ${m.contact_name}`, date: m.next_date, done: !!m.next_done }));
  return items;
}));

app.get('/api/search', wrap((req) => {
  const q = String(req.query.q || '').trim();
  if (!q) return [];
  const ids = inList(accessibleProjectIds(req.user));
  const like = `%${q}%`;
  const out = [];
  db.prepare(`${TICKET_SELECT} WHERE t.project_id IN (${ids}) AND (t.title LIKE ? OR t.body LIKE ? OR (p.key || '-' || t.number) LIKE ? OR t.tags LIKE ?) ORDER BY t.updated_at DESC LIMIT 12`)
    .all(like, like, like, like).forEach((t) => out.push({ type: 'ticket', id: t.id, project_id: t.project_id, title: t.title, sub: `${t.project_key}-${t.number}` }));
  db.prepare(`SELECT * FROM meetings WHERE project_id IN (${ids}) AND (title LIKE ? OR agenda LIKE ? OR notes LIKE ?) LIMIT 6`).all(like, like, like)
    .forEach((m) => out.push({ type: 'meeting', id: m.id, project_id: m.project_id, title: m.title, sub: m.date || '' }));
  db.prepare(`SELECT * FROM contacts WHERE project_id IN (${ids}) AND (name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?) LIMIT 6`).all(like, like, like, like)
    .forEach((c) => out.push({ type: 'contact', id: c.id, project_id: c.project_id, title: c.name, sub: c.company || c.email }));
  db.prepare(`SELECT * FROM events WHERE project_id IN (${ids}) AND (title LIKE ? OR location LIKE ? OR description LIKE ?) LIMIT 6`).all(like, like, like)
    .forEach((e) => out.push({ type: 'event', id: e.id, project_id: e.project_id, title: e.title, sub: e.location || e.start }));
  db.prepare(`SELECT id, project_id, title, icon FROM pages WHERE project_id IN (${ids}) AND (title LIKE ? OR content LIKE ?) LIMIT 6`).all(like, like)
    .forEach((pg) => out.push({ type: 'page', id: pg.id, project_id: pg.project_id, title: pg.title, sub: pg.icon }));
  return out;
}));

// ---------------------------------------------------------------- errors + static
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `File is too large — the limit is ${MAX_UPLOAD_MB} MB` });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => console.log(`Task Manager CEO running on http://localhost:${PORT}`));
