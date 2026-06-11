use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
    pub current_session: Mutex<Option<String>>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("memory.db");
        let conn = Connection::open(db_path)?;

        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                summary TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id),
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_profile (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);",
        )?;

        Ok(Database {
            conn: Mutex::new(conn),
            current_session: Mutex::new(None),
        })
    }

    pub fn close_previous_session(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET ended_at = unixepoch()
             WHERE id = (SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1)",
            [],
        )?;
        Ok(())
    }

    pub fn start_session(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, started_at) VALUES (?1, unixepoch())",
            params![id],
        )?;
        self.current_session.lock().unwrap().replace(id.to_string());
        Ok(())
    }

    pub fn end_current_session(&self) -> Result<(), rusqlite::Error> {
        let sid = self.current_session.lock().ok().and_then(|mut s| s.take());
        if let Some(ref id) = sid {
            if let Ok(conn) = self.conn.lock() {
                conn.execute(
                    "UPDATE sessions SET ended_at = unixepoch() WHERE id = ?1",
                    params![id],
                )?;
            }
        }
        Ok(())
    }

    pub fn save_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?1, ?2, ?3, unixepoch())",
            params![session_id, role, content],
        )?;
        conn.execute(
            "UPDATE sessions SET ended_at = unixepoch() WHERE id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    pub fn search_messages(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<Vec<(String, String, String, i64)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT session_id, role, content, created_at FROM messages
             WHERE content LIKE ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn get_profile(&self) -> Result<Vec<(String, String)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT key, value FROM user_profile")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn upsert_profile(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO user_profile (key, value, updated_at) VALUES (?1, ?2, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()",
            params![key, value],
        )?;
        Ok(())
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        self.end_current_session().ok();
    }
}
