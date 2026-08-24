// ========== Diagnostic IPC command ==========

use crate::diagnostics::SystemDiagnostic;
use crate::AppState;
use tauri::State;

/// Returns runtime diagnostics: log paths, DB status, recent errors.
/// Callable from frontend for self-inspection.
#[tauri::command]
pub fn get_diagnostics(state: State<AppState>) -> SystemDiagnostic {
    let db_path = crate::db::mailmaster_repo::default_database_path()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| "网易邮箱大师日历路径不可用".to_string());

    SystemDiagnostic {
        log_dir: state.log_paths.log_dir.clone(),
        db_path,
        db_wal_enabled: true,
        mcp_port: 0,
        mcp_running: false,
        recent_errors: state.error_ring.snapshot(),
    }
}
