use winreg::RegKey;
use winreg::enums::*;

pub fn set_context_menu() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_str().ok_or("Invalid executable path")?;
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("markdown-rs.exe");

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    {
        let path = r"Software\Classes\*\shell\MarkdownRS";
        let (key, _) = hkcu.create_subkey(path).map_err(|e| e.to_string())?;

        key.set_value("", &"Open with MarkdownRS")
            .map_err(|e| e.to_string())?;
        key.set_value("Icon", &exe_str).map_err(|e| e.to_string())?;

        let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
        cmd_key
            .set_value("", &format!("\"{}\" \"%1\"", exe_str))
            .map_err(|e| e.to_string())?;
    }

    {
        let app_path = format!(r"Software\Classes\Applications\{}", exe_name);
        let (app_key, _) = hkcu.create_subkey(&app_path).map_err(|e| e.to_string())?;

        if let Err(e) = app_key.set_value("FriendlyAppName", &"MarkdownRS") {
            log::warn!("Failed to set FriendlyAppName: {}", e);
        }

        let (types_key, _) = app_key
            .create_subkey("SupportedTypes")
            .map_err(|e| e.to_string())?;
        for ext in &[".md", ".markdown", ".txt"] {
            if let Err(e) = types_key.set_value(ext, &"") {
                log::warn!("Failed to set SupportedTypes for {}: {}", ext, e);
            }
        }

        let (cmd_key, _) = app_key
            .create_subkey(r"shell\open\command")
            .map_err(|e| e.to_string())?;
        cmd_key
            .set_value("", &format!("\"{}\" \"%1\"", exe_str))
            .map_err(|e| e.to_string())?;
    }

    {
        let path = format!(r"Software\Classes\*\OpenWithList\{}", exe_name);
        if let Err(e) = hkcu.create_subkey(path) {
            log::warn!("Failed to create OpenWithList entry: {}", e);
        }
    }

    {
        for ext in &[".md", ".markdown", ".txt"] {
            let path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
            if let Err(e) = hkcu.create_subkey(path) {
                log::warn!("Failed to create OpenWithList for {}: {}", ext, e);
            }
        }
    }

    {
        for ext in &[".md", ".markdown"] {
            let path = format!(r"Software\Classes\{}\shell\Edit", ext);
            let (key, _) = hkcu.create_subkey(&path).map_err(|e| e.to_string())?;

            if let Err(e) = key.set_value("", &"Edit with MarkdownRS") {
                log::warn!("Failed to set Edit verb label for {}: {}", ext, e);
            }
            if let Err(e) = key.set_value("Icon", &exe_str) {
                log::warn!("Failed to set Edit verb icon for {}: {}", ext, e);
            }

            let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
            cmd_key
                .set_value("", &format!("\"{}\" \"%1\"", exe_str))
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub fn remove_context_menu() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("markdown-rs.exe");

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut errors = Vec::new();

    let mut delete_with_tracking = |path: &str, description: &str| {
        if let Err(e) = hkcu.delete_subkey_all(path) {
            if e.kind() != std::io::ErrorKind::NotFound && e.raw_os_error() != Some(2) {
                log::warn!(
                    "Failed to delete registry key '{}': {} - {}",
                    path,
                    description,
                    e
                );
                errors.push(format!("{}: {}", description, e));
            }
        } else {
            log::debug!(
                "Successfully deleted registry key: {} - {}",
                path,
                description
            );
        }
    };

    delete_with_tracking(
        r"Software\Classes\*\shell\MarkdownRS",
        "Classic context menu",
    );

    let app_path = format!(r"Software\Classes\Applications\{}", exe_name);
    delete_with_tracking(&app_path, "Application registration");

    let list_path = format!(r"Software\Classes\*\OpenWithList\{}", exe_name);
    delete_with_tracking(&list_path, "Global OpenWithList");

    for ext in &[".md", ".markdown", ".txt"] {
        let ext_list_path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
        delete_with_tracking(&ext_list_path, &format!("OpenWithList for {}", ext));

        if *ext != ".txt" {
            let edit_path = format!(r"Software\Classes\{}\shell\Edit", ext);
            delete_with_tracking(&edit_path, &format!("Edit verb for {}", ext));
        }
    }

    let critical_key = r"Software\Classes\*\shell\MarkdownRS";
    let critical_removed = hkcu.open_subkey(critical_key).is_err();

    if !errors.is_empty() {
        log::warn!(
            "Registry cleanup completed with {} error(s): {:?}",
            errors.len(),
            errors
        );

        if !critical_removed {
            return Err(format!(
                "Failed to remove critical context menu registry entries. Errors: {}",
                errors.join("; ")
            ));
        }

        log::info!("Registry cleanup completed with non-critical errors (best effort mode)");
    } else {
        log::info!("Registry cleanup completed successfully");
    }

    Ok(())
}

pub fn check_context_menu() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Classes\*\shell\MarkdownRS";
    hkcu.open_subkey(path).is_ok()
}
