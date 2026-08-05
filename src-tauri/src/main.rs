#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod commands;
mod db;
mod markdown;
mod migration;
mod portable;
mod state;
mod themes;
mod utils;

use tauri::Emitter;
use tauri::Manager;

fn main() {
    migration::migrate_data_dir_if_needed();

    let portable_config = portable::detect_portable_mode();
    let is_portable = portable_config.is_portable();
    let portable_data_dir_path = portable_config.data_dir().cloned();
    portable::init_portable_config(portable_config);

    if is_portable && let Some(ref data_dir) = portable_data_dir_path {
        unsafe {
            std::env::set_var("APPDATA", data_dir.as_os_str());
            std::env::set_var("LOCALAPPDATA", data_dir.as_os_str());
        }
    }

    #[cfg(target_os = "windows")]
    {
        unsafe {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--disable-features=CalculateNativeWinOcclusion --disable-direct-composition",
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let windows = app.webview_windows();
            if let Some((_, window)) = windows.iter().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();

                if args.len() > 1 {
                    let file_path = &args[1];
                    log::info!("Opening file from command line: {}", file_path);
                    let _ = window.emit("open-file-from-args", file_path);
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .with_filename(".window-state.json")
                .build(),
        )
        .setup(bootstrap::run)
        .invoke_handler(tauri::generate_handler![
            commands::session::save_session,
            commands::session::restore_session,
            commands::session::load_tab_content,
            commands::session::vacuum_database,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::write_binary_file,
            commands::files::get_file_metadata,
            commands::files::send_to_recycle_bin,
            commands::files::create_file,
            commands::files::create_dir,
            commands::files::resolve_path_relative,
            commands::files::rename_file,
            commands::files::add_to_file_history,
            commands::files::get_file_history,
            commands::files::remove_from_file_history,
            commands::files::clear_file_history,
            commands::directory::list_directory,
            commands::directory::get_directory_mtime,
            commands::settings::get_app_info,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::add_to_dictionary,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::load_user_dictionary,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::init::init_spellchecker,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::check_words,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::get_spelling_suggestions,
            #[cfg(feature = "spellcheck")]
            commands::spellcheck::get_spellcheck_status,
            commands::markdown::render_markdown,
            commands::markdown::format_markdown,
            commands::markdown::lint_markdown,
            commands::markdown::generate_document_toc,
            commands::markdown::get_rumdl_config_path,
            commands::markdown::get_markdown_flavors,
            commands::bookmarks::add_bookmark,
            commands::bookmarks::get_all_bookmarks,
            commands::bookmarks::delete_bookmark,
            commands::bookmarks::update_bookmark_access_time,
            commands::settings::get_available_themes,
            commands::settings::get_theme_css,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::context_menu::set_context_menu_item,
            commands::context_menu::check_context_menu_status,
            commands::settings::toggle_devtools,
            #[cfg(feature = "pdf-export")]
            commands::export::export_to_pdf,
            commands::data::export_bookmarks,
            commands::data::import_bookmarks,
            commands::data::export_file_history,
            commands::data::import_file_history,
            commands::data::delete_orphan_files,
            commands::window::set_window_title,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            let msg = format!("Error while running tauri application: {}", e);
            log::error!("{}", msg);
            eprintln!("{}", msg);
            std::process::exit(1);
        });
}
