import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../tickets.db');
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    product TEXT,
    topic TEXT,
    issue_details TEXT,
    parent_channel_id TEXT,
    assigned_to TEXT,
    tags TEXT,
    thread_name TEXT,
    supporters TEXT,
    rating INTEGER
  );

  CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Seed default settings if not exists
  INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('maintenance', 'false');
  INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('bot_status', 'online');
  INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('bot_activity', 'LAWNET Tickets 🎫');
  INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('bot_activity_type', 'PLAYING');

  CREATE TABLE IF NOT EXISTS transcripts (
    ticket_id INTEGER PRIMARY KEY,
    html_content TEXT,
    json_content TEXT,
    text_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.prepare("ALTER TABLE tickets ADD COLUMN rating INTEGER").run();
  console.log('Migrated: Added rating column to tickets table.');
} catch (e) {
  // Ignore if column already exists
}

try {
  db.prepare("ALTER TABLE tickets ADD COLUMN rating_comment TEXT").run();
  console.log('Migrated: Added rating_comment column to tickets table.');
} catch (e) { }

export default db;
