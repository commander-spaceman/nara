#[cfg(windows)]
pub fn detect_background(app_handle: tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::{Emitter, Manager};
    use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let interval = std::time::Duration::from_millis(800);
        let mut last_theme: Option<bool> = None;

        while r.load(Ordering::Relaxed) {
            std::thread::sleep(interval);

            let Some(window) = handle.get_webview_window("main") else {
                return;
            };

            let Ok(pos) = window.outer_position() else {
                continue;
            };
            let Ok(size) = window.outer_size() else {
                continue;
            };

            let cx = pos.x + (size.width as i32) - 20;
            let cy = pos.y + (size.height as i32) / 5;

            let dc = unsafe { GetDC(std::ptr::null_mut()) };
            let pixel = unsafe { GetPixel(dc, cx, cy) };
            unsafe {
                ReleaseDC(std::ptr::null_mut(), dc);
            }

            let r = ((pixel >> 0) & 0xFF) as f32;
            let g = ((pixel >> 8) & 0xFF) as f32;
            let b = ((pixel >> 16) & 0xFF) as f32;
            let luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            let is_dark = luminance < 128.0;

            if last_theme != Some(is_dark) {
                last_theme = Some(is_dark);
                let theme = if is_dark { "dark" } else { "light" };
                let _ = handle.emit("background-theme", theme);
            }
        }
    });
}
