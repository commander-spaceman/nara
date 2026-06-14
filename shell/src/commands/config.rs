use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const KEYRING_SERVICE: &str = "com.nara.desktop";

#[tauri::command]
pub fn config_load(app: AppHandle) -> Result<Value, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for (key, value) in store.entries() {
        map.insert(key, value);
    }
    Ok(Value::Object(map))
}

#[tauri::command]
pub fn config_save(app: AppHandle, config: Value) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.clear();
    if let Some(obj) = config.as_object() {
        for (key, value) in obj {
            store.set(key.clone(), value.clone());
        }
    }
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_get(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    Ok(store.get(&key))
}

#[tauri::command]
pub fn config_set(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.set(key, value);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_get_api_key(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn config_set_api_key(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_delete_api_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
