use winreg::RegKey;
use winreg::enums::*;

fn get_exe_info() -> Result<(String, String), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path
        .to_str()
        .ok_or("Invalid executable path")?
        .to_string();
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            log::warn!(
                "Could not determine exe filename from {:?}, using fallback",
                exe_path
            );
            "markdown-rs.exe".to_string()
        });
    Ok((exe_str, exe_name))
}

fn set_command(subkey: &RegKey, command: &str) -> Result<(), String> {
    let (cmd_key, _) = subkey.create_subkey("command").map_err(|e| e.to_string())?;
    cmd_key.set_value("", &command).map_err(|e| e.to_string())
}

fn create_verb(
    hkcu: &RegKey,
    parent_path: &str,
    verb: &str,
    label: &str,
    icon: &str,
    command: &str,
) -> Result<(), String> {
    let key_path = format!(r"{}\{}", parent_path, verb);
    let (key, _) = hkcu.create_subkey(&key_path).map_err(|e| e.to_string())?;
    key.set_value("", &label).map_err(|e| e.to_string())?;
    key.set_value("Icon", &icon).map_err(|e| e.to_string())?;
    set_command(&key, command)
}

fn create_or_warn(hkcu: &RegKey, path: &str, description: &str) {
    if let Err(e) = hkcu.create_subkey(path) {
        log::warn!("Failed to create {}: {}", description, e);
    }
}

pub fn set_context_menu() -> Result<(), String> {
    let (exe_str, exe_name) = get_exe_info()?;
    let command = format!("\"{}\" \"%1\"", exe_str);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    create_verb(
        &hkcu,
        r"Software\Classes\*\shell",
        "MarkdownRS",
        "Open with MarkdownRS",
        &exe_str,
        &command,
    )?;

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
        cmd_key.set_value("", &command).map_err(|e| e.to_string())?;
    }

    create_or_warn(
        &hkcu,
        &format!(r"Software\Classes\*\OpenWithList\{}", exe_name),
        "OpenWithList entry",
    );

    for ext in &[".md", ".markdown", ".txt"] {
        create_or_warn(
            &hkcu,
            &format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name),
            &format!("OpenWithList for {}", ext),
        );
    }

    for ext in &[".md", ".markdown"] {
        create_verb(
            &hkcu,
            &format!(r"Software\Classes\{}", ext),
            "shell\\Edit",
            "Edit with MarkdownRS",
            &exe_str,
            &command,
        )?;
    }

    Ok(())
}

pub fn remove_context_menu() -> Result<(), String> {
    let (_, exe_name) = get_exe_info()?;
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
