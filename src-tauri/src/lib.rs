// ========== Library entry point for Tauri 2 (Phase 2: MCP + Diagnostics) ==========

pub mod commands;
pub mod db;
pub mod diagnostics;
pub mod error;
pub mod models;

use std::sync::Arc;
use tauri::{
    image::Image,
    menu::MenuBuilder,
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const TRAY_MENU_SHOW: &str = "show";
const TRAY_MENU_QUIT: &str = "quit";

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
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
}

pub fn run() {
    let error_ring = Arc::new(diagnostics::ErrorRing::new());
    let log_paths = diagnostics::init(error_ring.clone());
    // diagnostics::init() sets up both stdout + file logging

    let app_state = AppState {
        error_ring: error_ring.clone(),
        log_paths,
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

            let tray_menu = MenuBuilder::new(app)
                .text(TRAY_MENU_SHOW, "显示日历")
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
                    TRAY_MENU_SHOW => show_main_window(app),
                    TRAY_MENU_QUIT => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            if let Err(error) = window.set_always_on_bottom(true) {
                tracing::warn!("[RUST SETUP] Failed to keep calendar on desktop: {}", error);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
