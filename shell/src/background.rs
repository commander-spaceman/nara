#[cfg(windows)]
#[derive(Default)]
pub struct BackgroundProbeState {
    probe: std::sync::Mutex<Option<ProbeRect>>,
}

#[cfg(windows)]
#[derive(Clone, Copy)]
struct ProbeRect {
    center_x: f64,
    center_y: f64,
    width: f64,
    height: f64,
}

#[cfg(windows)]
#[tauri::command]
pub fn background_set_probe(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    probe_state: tauri::State<'_, BackgroundProbeState>,
) {
    if let Ok(mut probe) = probe_state.probe.lock() {
        *probe = Some(ProbeRect {
            center_x: x,
            center_y: y,
            width,
            height,
        });
    }
}

#[cfg(windows)]
pub fn detect_background(app_handle: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};

    const THEME_THRESHOLD: f32 = 128.0;
    const REQUIRED_STABLE_POLLS: u8 = 2;

    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let interval = std::time::Duration::from_millis(800);
        let mut last_theme: Option<bool> = None;
        let mut pending_theme: Option<bool> = None;
        let mut stable_polls: u8 = 0;

        loop {
            std::thread::sleep(interval);

            let Some(window) = handle.get_webview_window("main") else {
                return;
            };

            let Ok(pos) = window.inner_position() else {
                continue;
            };
            let Ok(size) = window.inner_size() else {
                continue;
            };
            let scale = window.scale_factor().unwrap_or(1.0);

            let probe = handle.state::<BackgroundProbeState>();
            let sample = probe
                .probe
                .lock()
                .ok()
                .and_then(|guard| *guard)
                .unwrap_or(ProbeRect {
                    center_x: size.width as f64 * 0.5,
                    center_y: size.height as f64 * 0.5,
                    width: size.width as f64,
                    height: size.height as f64,
                });

            let cx = pos.x + (sample.center_x * scale).round() as i32;
            let cy = pos.y + (sample.center_y * scale).round() as i32;
            let radius_x = ((sample.width * 0.28) * scale).round() as i32;
            let radius_y = ((sample.height * 0.28) * scale).round() as i32;
            let sample_offsets = [
                (-radius_x, 0),
                (radius_x, 0),
                (0, -radius_y),
                (0, radius_y),
                (-radius_x, -radius_y),
                (radius_x, -radius_y),
                (-radius_x, radius_y),
                (radius_x, radius_y),
            ];

            let dc = unsafe { GetDC(std::ptr::null_mut()) };
            let mut luminance_total = 0.0;
            let mut sample_count = 0;
            for (dx, dy) in sample_offsets {
                let pixel = unsafe { GetPixel(dc, cx + dx, cy + dy) };
                if pixel == u32::MAX {
                    continue;
                }

                let r = ((pixel >> 0) & 0xFF) as f32;
                let g = ((pixel >> 8) & 0xFF) as f32;
                let b = ((pixel >> 16) & 0xFF) as f32;
                luminance_total += 0.299 * r + 0.587 * g + 0.114 * b;
                sample_count += 1;
            }
            unsafe {
                ReleaseDC(std::ptr::null_mut(), dc);
            }
            if sample_count == 0 {
                continue;
            }

            let luminance = luminance_total / sample_count as f32;
            let is_dark = luminance < THEME_THRESHOLD;

            if last_theme == Some(is_dark) {
                pending_theme = None;
                stable_polls = 0;
                continue;
            }

            if pending_theme == Some(is_dark) {
                stable_polls = stable_polls.saturating_add(1);
            } else {
                pending_theme = Some(is_dark);
                stable_polls = 1;
            }

            if stable_polls >= REQUIRED_STABLE_POLLS {
                last_theme = Some(is_dark);
                pending_theme = None;
                stable_polls = 0;
                let theme = if is_dark { "dark" } else { "light" };
                let _ = handle.emit("background-theme", theme);
            }
        }
    });
}

#[cfg(not(windows))]
#[tauri::command]
pub fn background_set_probe(_x: f64, _y: f64, _width: f64, _height: f64) {}

#[cfg(not(windows))]
pub fn detect_background(_app_handle: tauri::AppHandle) {}
