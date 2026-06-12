use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

use crate::commands::quarian_fx::FxParams;

const SCRIPT: &str = include_str!("../../../scripts/quarian_fx.py");

fn python_bin() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let venv_python = manifest.join("../.venv/Scripts/python.exe");
    if venv_python.exists() {
        return venv_python;
    }
    PathBuf::from("python")
}

pub struct Sidecar {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    child: Mutex<Child>,
}

impl Sidecar {
    pub fn start() -> Result<Self, String> {
        let pid = std::process::id();
        let dir = std::env::temp_dir();
        let script_path = dir.join(format!("nara_sidecar_{pid}.py"));
        std::fs::write(&script_path, SCRIPT).map_err(|e| format!("write sidecar script: {e}"))?;

        let mut child = Command::new(python_bin())
            .arg(&script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("spawn sidecar: {e}"))?;

        let stdin = child.stdin.take().expect("sidecar stdin");
        let stdout = child.stdout.take().expect("sidecar stdout");
        let stderr = child.stderr.take().expect("sidecar stderr");

        let mut stdout_reader = BufReader::new(stdout);
        let mut ready_line = String::new();
        stdout_reader
            .read_line(&mut ready_line)
            .map_err(|e| format!("read ready: {e}"))?;

        let _ = std::fs::remove_file(&script_path);

        if !ready_line.contains("\"ready\"") {
            let mut stderr_reader = BufReader::new(stderr);
            let mut stderr_out = String::new();
            let _ = stderr_reader.read_line(&mut stderr_out);
            let _ = child.kill();
            return Err(format!(
                "sidecar init failed. ready: {ready_line} stderr: {stderr_out}"
            ));
        }

        Ok(Self {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(stdout_reader),
            child: Mutex::new(child),
        })
    }

    pub fn process(&self, wav: &[u8], params: &FxParams) -> Result<Vec<u8>, String> {
        let cmd = serde_json::json!({"size": wav.len(), "params": params}).to_string() + "\n";

        {
            let mut stdin = self.stdin.lock().map_err(|e| format!("lock stdin: {e}"))?;
            stdin
                .write_all(cmd.as_bytes())
                .map_err(|e| format!("write cmd: {e}"))?;
            stdin
                .write_all(wav)
                .map_err(|e| format!("write wav: {e}"))?;
            stdin.flush().map_err(|e| format!("flush: {e}"))?;
        }

        let mut response = String::new();
        {
            let mut reader = self
                .stdout
                .lock()
                .map_err(|e| format!("lock stdout: {e}"))?;
            reader
                .read_line(&mut response)
                .map_err(|e| format!("read response: {e}"))?;
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&response).map_err(|e| format!("parse response: {e}"))?;

        match parsed["status"].as_str() {
            Some("ok") => {
                let size = parsed["size"].as_u64().ok_or("missing size")? as usize;
                let mut data = vec![0u8; size];
                let mut reader = self
                    .stdout
                    .lock()
                    .map_err(|e| format!("lock stdout: {e}"))?;
                reader
                    .read_exact(&mut data)
                    .map_err(|e| format!("read wav: {e}"))?;
                Ok(data)
            }
            Some("error") => {
                let msg = parsed["message"].as_str().unwrap_or("unknown");
                let tb = parsed["traceback"].as_str().unwrap_or("");
                Err(format!("python: {msg}\n{tb}"))
            }
            _ => Err(format!("bad sidecar response: {response}")),
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}
