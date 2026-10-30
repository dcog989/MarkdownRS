pub mod database;
pub mod desktop;
pub mod logging;
pub mod paths;
pub mod state;
pub mod window;

use crate::migration;
use crate::themes;
use std::fs;
use tauri::Manager;

pub fn run(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let window = app.get_webview_window("main").ok_or("Failed to get main window")?;

    window::configure(&window);

    let paths = paths::resolve_app_paths(app_handle)?;
    // The window background and the log level both come from settings, so the
    // file is read once instead of once per consumer.
    let saved_settings = crate::utils::read_settings_toml(&paths.config_path).ok();
    // Before anything slow: the window is already visible, so the theme colour
    // should replace the static fallback as early as possible.
    window::apply_saved_background(&window, saved_settings.as_ref());
    fs::create_dir_all(&paths.log_dir)?;
    logging::init(saved_settings.as_ref(), &paths.log_dir)?;
    migration::migrate_to_config(&paths.local_dir, &paths.config_dir);
    paths::ensure_directories(&paths);
    paths::schedule_temp_cleanup(vec![
        paths.local_dir.clone(),
        paths.config_dir.clone(),
        paths.cache_dir.clone(),
    ]);
    logging::log_runtime_info(&paths);
    desktop::install_appimage_integration();
    themes::seed_default_themes(paths.themes_dir);
    paths::ensure_dictionary_file(&paths.dict_path);

    let db = database::init(paths.db_dir.join("session.db"), &paths.db_dir)?;
    database::schedule_vacuum(app_handle);
    state::manage(app, db);
    window::handle_cli_args(window);

    Ok(())
}
