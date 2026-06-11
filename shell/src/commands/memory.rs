use crate::db::Database;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct ProfileEntry {
    key: String,
    value: String,
}

#[tauri::command]
pub fn memory_start_session(db: State<'_, Database>, session_id: String) -> Result<(), String> {
    db.start_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_end_session(db: State<'_, Database>) -> Result<(), String> {
    db.end_current_session().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_save_message(
    db: State<'_, Database>,
    session_id: String,
    role: String,
    content: String,
) -> Result<(), String> {
    db.save_message(&session_id, &role, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_list_sessions(
    db: State<'_, Database>,
    limit: u32,
) -> Result<Vec<serde_json::Value>, String> {
    let results = db.list_sessions(limit).map_err(|e| e.to_string())?;
    let json = results
        .into_iter()
        .map(|(id, started_at, ended_at, msg_count)| {
            serde_json::json!({
                "id": id,
                "started_at": started_at,
                "ended_at": ended_at,
                "msg_count": msg_count,
            })
        })
        .collect();
    Ok(json)
}

#[tauri::command]
pub fn memory_load_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let results = db
        .load_session_messages(&session_id)
        .map_err(|e| e.to_string())?;
    let json = results
        .into_iter()
        .map(|(role, content, created_at)| {
            serde_json::json!({
                "role": role,
                "content": content,
                "created_at": created_at,
            })
        })
        .collect();
    Ok(json)
}

#[tauri::command]
pub fn memory_search(
    db: State<'_, Database>,
    query: String,
    limit: u32,
) -> Result<Vec<serde_json::Value>, String> {
    let results = db
        .search_messages(&query, limit)
        .map_err(|e| e.to_string())?;
    let json = results
        .into_iter()
        .map(|(sid, role, content, created_at)| {
            serde_json::json!({
                "session_id": sid,
                "role": role,
                "content": content,
                "created_at": created_at,
            })
        })
        .collect();
    Ok(json)
}

#[tauri::command]
pub fn memory_get_profile(db: State<'_, Database>) -> Result<Vec<ProfileEntry>, String> {
    let rows = db.get_profile().map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(key, value)| ProfileEntry { key, value })
        .collect())
}

#[tauri::command]
pub fn memory_upsert_profile(
    db: State<'_, Database>,
    key: String,
    value: String,
) -> Result<(), String> {
    db.upsert_profile(&key, &value).map_err(|e| e.to_string())
}
