# Task Manager CEO

An internal, Notion-style workspace for running projects: tickets on a board, meetings with action items, a communication log for outside contacts, events, team docs, a shared calendar and an inbox.

No public sign-up and no email. An admin creates a **user ID**, sends it to the person, and the first time they sign in with it they create their own password.

## Run it

Requires Node.js 20 or newer.

```bash
npm run setup     # installs server + client and builds the UI
npm start         # http://localhost:4000
```

Sign in as **`KaranGill`** (admin). The first sign-in asks you to create the password, so do this right after deploying.

On first run the app creates:

- Admin user `KaranGill`
- Projects **Polaris** (POL), **Centurion** (CEN), **PointO** (PTO), each with To Do / In Progress / Blocked / Done columns and an overview doc

Data lives in a single SQLite file at `server/data/taskmanager.db` (override with `DATA_DIR`). Back that file up to back up everything.

### Docker

```bash
docker build -t task-manager-ceo .
docker run -d -p 4000:4000 -v tmc-data:/data --name tmc task-manager-ceo
```

### Developing

Run `npm run dev:server` and `npm run dev:client` in two terminals, then open http://localhost:5173 (the Vite dev server proxies `/api` to port 4000).

## What's inside

**Accounts & access**
- Admin → Users: create user IDs, set role (Admin or Team member), choose projects, copy a ready-to-send invite message
- Reset password (user sets a new one at next sign-in), deactivate/reactivate
- Team members only see projects they're added to; admins see everything
- Account settings: name, title, avatar color, change password, dark mode

**Projects** (admin creates them, picks icon/key, adds members, archives or deletes)

Each project has these tabs:

| Tab | What it does |
|---|---|
| **Tickets** | Board (drag & drop) and Table views. Custom columns: add, rename, recolor, reorder, delete, mark which count as "done". Filters for assignee, priority, tags, "Mine", and search |
| **Meetings** | Title, date/time, duration, type, status, hosted by, attendees, external guests, location/link, agenda, notes (what happened), decisions, and **action items** that are real tickets linked to the meeting. Copy a markdown summary |
| **Communication** | Contacts (name, email, phone, company, role, stage, owner, notes) with a per-contact log: date, channel, what happened, outcome, optional next-communication date and next action. Follow-ups list with tick-off |
| **Events** | Title, start/end, where, category, status, owner, details. List and month-calendar views |
| **Docs** | Wiki pages with emoji icons, markdown, autosave and templates (brief, SOP, weekly update) |
| **Activity** | Full history of changes in the project |
| **Settings** | Admin only: name, icon, description, columns, members, archive/delete |

**Tickets** have an ID (e.g. `POL-12`), title, markdown description, status, priority (Urgent/High/Medium/Low), assignee, start & due dates, tags, estimate, linked meeting, checklist, comments with `@mentions`, and an activity history. Everything is editable inline in a side panel, Notion-style.

**Across projects**
- **Home**: my open tickets, overdue tickets, follow-ups due this week, upcoming meetings & events, project progress, recent activity
- **My tickets**: everything assigned to you, grouped by project
- **Calendar**: meetings, events, ticket due dates and follow-ups, filterable by type and project
- **Inbox**: notifications when you're assigned, mentioned, commented on, invited to a meeting or added to a project
- **Search** (⌘K / Ctrl+K): tickets, meetings, contacts, events and docs

Shortcuts: ⌘/Ctrl+K search, ⌘/Ctrl+\ toggle sidebar, Esc closes panels, ⌘/Ctrl+Enter saves text and sends comments.

## Notes on security

- Passwords are hashed with scrypt; sessions last 30 days.
- Until someone sets their password, anyone who knows that user ID can claim the account, so send IDs privately and ask people to sign in soon. Optionally set an initial password when creating the user.
- Put it behind HTTPS (e.g. a reverse proxy like Caddy or Nginx) if it's reachable outside your network.
