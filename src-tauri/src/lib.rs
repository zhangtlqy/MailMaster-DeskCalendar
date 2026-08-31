// ========== Library entry point for Tauri 2 (Phase 2: MCP + Diagnostics) ==========

pub mod commands;
pub mod db;
pub mod diagnostics;
pub mod error;
pub mod models;

use std::sync::{Arc, Mutex};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;

const TRAY_MENU_TOGGLE: &str = "toggle-visibility";
const TRAY_MENU_AUTOSTART: &str = "toggle-autostart";
const TRAY_MENU_QUIT: &str = "quit";

fn set_tray_toggle_text(app: &tauri::AppHandle, text: &str) {
    let item = {
        let state = app.state::<AppState>();
        let guard = match state.tray_toggle_item.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        guard.as_ref().cloned()
    };
    if let Some(item) = item {
        let _ = item.set_text(text);
    }
}

fn set_tray_autostart_text(app: &tauri::AppHandle, enabled: bool) {
    let item = {
        let state = app.state::<AppState>();
        let guard = match state.tray_autostart_item.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        guard.as_ref().cloned()
    };
    if let Some(item) = item {
        let text = if enabled { "关闭开机自启" } else { "开启开机自启" };
        let _ = item.set_text(text);
    }
}

fn toggle_autostart(app: &tauri::AppHandle) {
    let manager = app.autolaunch();
    let result = manager.is_enabled().and_then(|enabled| {
        if enabled { manager.disable() } else { manager.enable() }?;
        Ok(!enabled)
    });
    match result {
        Ok(enabled) => set_tray_autostart_text(app, enabled),
        Err(error) => tracing::warn!("[TRAY] Failed to toggle autostart: {}", error),
    }
}

#[tauri::command]
fn sync_tray_autostart(app: tauri::AppHandle, enabled: bool) {
    set_tray_autostart_text(&app, enabled);
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // A bottom-most window may be placed underneath Wallpaper Engine's
        // WorkerW window. Restore normal z-order before showing it.
        let _ = window.set_always_on_bottom(false);
        let _ = window.show();
        let _ = app.emit("ensure-window-visible", ());
        let _ = window.set_focus();
        set_tray_toggle_text(app, "隐藏日历");
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        set_tray_toggle_text(app, "显示日历");
    }
}

fn calendar_tray_icon() -> Image<'static> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];

    let mut set_px = |x: u32, y: u32, color: [u8; 4]| {
        let idx = ((y * SIZE + x) * 4) as usize;
        rgba[idx..idx + 4].copy_from_slice(&color);
    };

    for y in 5..29 {
        for x in 4..28 {
            let is_corner =
                (x < 7 && y < 8) || (x > 24 && y < 8) || (x < 7 && y > 25) || (x > 24 && y > 25);
            if !is_corner {
                set_px(x, y, [246, 249, 255, 255]);
            }
        }
    }

    for y in 5..11 {
        for x in 4..28 {
            set_px(x, y, [42, 126, 255, 255]);
        }
    }

    for x in 6..26 {
        set_px(x, 27, [42, 126, 255, 255]);
    }
    for y in 8..27 {
        set_px(4, y, [42, 126, 255, 255]);
        set_px(27, y, [42, 126, 255, 255]);
    }

    for x in [10, 16, 22] {
        for y in [15, 20, 24] {
            for yy in y..y + 2 {
                for xx in x..x + 2 {
                    set_px(xx, yy, [42, 126, 255, 255]);
                }
            }
        }
    }

    Image::new_owned(rgba, SIZE, SIZE)
}

pub struct AppState {
    pub error_ring: Arc<diagnostics::ErrorRing>,
    pub log_paths: diagnostics::LogPaths,
    pub tray_toggle_item: Mutex<Option<MenuItem<tauri::Wry>>>,
    pub tray_autostart_item: Mutex<Option<MenuItem<tauri::Wry>>>,
}

pub fn run() {
    let error_ring = Arc::new(diagnostics::ErrorRing::new());
    let log_paths = diagnostics::init(error_ring.clone());
    // diagnostics::init() sets up both stdout + file logging

    let app_state = AppState {
        error_ring: error_ring.clone(),
        log_paths,
        tray_toggle_item: Mutex::new(None),
        tray_autostart_item: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().app_name("DeskCalendar").build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_diagnostics,
            commands::log_frontend_error,
            commands::set_always_on_top,
            commands::diag_log,
            commands::list_mailmaster_events,
            commands::get_default_mailmaster_database_path,
            commands::validate_mailmaster_database,
            commands::check_mailmaster_database,
            commands::set_mailmaster_todo_completed,
            sync_tray_autostart,
        ])
        // Debug-only window resize trace for transition diagnostics.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                let outer = window.outer_size().unwrap_or_default();
                let scale = window.scale_factor().unwrap_or(1.0);
                let logical_w = outer.width as f64 / scale;
                let logical_h = outer.height as f64 / scale;
                tracing::debug!(
                    "[RUST EVENT] Window Resized: physical={}x{} outerSize={}x{} logicalSize={:.0}x{:.0} scaleFactor={:.2}",
                    size.width, size.height,
                    outer.width, outer.height,
                    logical_w, logical_h,
                    scale
                );
            }
        })
        .setup(move |app| {
            // ====== Tray: click to restore window ======
            let window = app.get_webview_window("main")
                .expect("main window not found");

            // Debug-only initial window state trace.
            let outer_size = window.outer_size().unwrap_or_default();
            let inner_size = window.inner_size().unwrap_or_default();
            let outer_pos = window.outer_position().unwrap_or_default();
            let scale = window.scale_factor().unwrap_or(1.0);
            tracing::debug!(
                "[RUST SETUP] Window init state: outerSize={}x{} innerSize={}x{} outerPos=({},{}) scaleFactor={:.2} decorations={} resizable={} transparent=true",
                outer_size.width, outer_size.height,
                inner_size.width, inner_size.height,
                outer_pos.x, outer_pos.y,
                scale,
                window.is_decorated().unwrap_or(false),
                window.is_resizable().unwrap_or(false)
            );

            let toggle_item = MenuItemBuilder::with_id(TRAY_MENU_TOGGLE, "隐藏日历").build(app)?;
            if let Ok(mut item) = app.state::<AppState>().tray_toggle_item.lock() {
                *item = Some(toggle_item.clone());
            }
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_text = if autostart_enabled {
                "关闭开机自启"
            } else {
                "开启开机自启"
            };
            let autostart_item =
                MenuItemBuilder::with_id(TRAY_MENU_AUTOSTART, autostart_text).build(app)?;
            if let Ok(mut item) = app.state::<AppState>().tray_autostart_item.lock() {
                *item = Some(autostart_item.clone());
            }
            let tray_menu = MenuBuilder::new(app)
                .item(&toggle_item)
                .item(&autostart_item)
                .separator()
                .text(TRAY_MENU_QUIT, "退出")
                .build()?;

            TrayIconBuilder::with_id("desktop-calendar-tray")
                .icon(calendar_tray_icon())
                .icon_as_template(false)
                .tooltip("桌面日历")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    TRAY_MENU_TOGGLE => {
                        let is_visible = app
                            .get_webview_window("main")
                            .and_then(|window| window.is_visible().ok())
                            .unwrap_or(false);
                        if is_visible {
                            hide_main_window(app);
                        } else {
                            show_main_window(app);
                        }
                    }
                    TRAY_MENU_AUTOSTART => toggle_autostart(app),
                    TRAY_MENU_QUIT => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
