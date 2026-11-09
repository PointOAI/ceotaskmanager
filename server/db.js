const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'taskmanager.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  title TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  password_hash TEXT,
  password_salt TEXT,
  color TEXT DEFAULT 'blue',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT 'blue',
  description TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  ticket_seq INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  position INTEGER NOT NULL DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  agenda TEXT DEFAULT '',
  date TEXT,
  duration INTEGER DEFAULT 30,
  location TEXT DEFAULT '',
  meeting_type TEXT DEFAULT 'Internal',
  host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  attendees TEXT DEFAULT '[]',
  external_attendees TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  decisions TEXT DEFAULT '',
  status TEXT DEFAULT 'Scheduled',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  status_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'Medium',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_date TEXT,
  due_date TEXT,
  tags TEXT DEFAULT '[]',
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  estimate TEXT DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  stage TEXT DEFAULT 'Lead',
  notes TEXT DEFAULT '',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  channel TEXT DEFAULT 'Call',
  summary TEXT DEFAULT '',
  outcome TEXT DEFAULT '',
  next_date TEXT,
  next_action TEXT DEFAULT '',
  next_done INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start TEXT NOT NULL,
  end TEXT,
  location TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  status TEXT DEFAULT 'Planned',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT DEFAULT '📄',
  content TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  link TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
`);

// ---- Migrations for databases created before a column existed ----
const ticketCols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
if (!ticketCols.includes('archived_at')) db.exec('ALTER TABLE tickets ADD COLUMN archived_at TEXT');
if (!ticketCols.includes('parent_id')) {
  db.exec('ALTER TABLE tickets ADD COLUMN parent_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_id)');
const projectCols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
if (!projectCols.includes('icon_image')) db.exec('ALTER TABLE projects ADD COLUMN icon_image TEXT');
const notifCols = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name);
if (!notifCols.includes('type')) db.exec("ALTER TABLE notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'general'");

const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const DEFAULT_STATUSES = [
  { name: 'To Do', color: 'gray', is_done: 0 },
  { name: 'In Progress', color: 'blue', is_done: 0 },
  { name: 'Blocked', color: 'red', is_done: 0 },
  { name: 'Done', color: 'green', is_done: 1 },
];

function createProject({ name, key, icon, color, description, created_by }) {
  const info = db
    .prepare('INSERT INTO projects (name, key, icon, color, description, created_by) VALUES (?,?,?,?,?,?)')
    .run(name, key, icon || '📁', color || 'blue', description || '', created_by || null);
  const pid = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO statuses (project_id, name, color, position, is_done) VALUES (?,?,?,?,?)');
  DEFAULT_STATUSES.forEach((s, i) => ins.run(pid, s.name, s.color, i, s.is_done));
  return pid;
}

// ---- Seed on first run ----
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const seed = db.transaction(() => {
    const admin = db
      .prepare("INSERT INTO users (username, display_name, title, role, color) VALUES ('KaranGill','Karan Gill','CEO','admin','purple')")
      .run().lastInsertRowid;
    const projects = [
      { name: 'Polaris', key: 'POL', icon: '⭐', color: 'blue', description: 'Polaris Institute' },
      { name: 'Centurion', key: 'CEN', icon: '🛡️', color: 'orange', description: 'Centurion' },
      { name: 'PointO', key: 'PTO', icon: '🍽️', color: 'green', description: 'PointO POS & AI assistant' },
    ];
    for (const p of projects) {
      const pid = createProject({ ...p, created_by: admin });
      db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?,?)').run(pid, admin);
      db.prepare(
        "INSERT INTO pages (project_id, title, icon, content, created_by, updated_by) VALUES (?, 'Project overview', '📌', ?, ?, ?)"
      ).run(
        pid,
        `# ${p.name}\n\nUse this page for the project brief, goals, links and anything the team should know.\n\n## Goals\n- \n\n## Key links\n- `,
        admin,
        admin
      );
    }
  });
  seed();
  console.log('Seeded database: admin user "KaranGill" and projects Polaris, Centurion, PointO');
}

module.exports = { db, createProject, ATTACHMENTS_DIR };
