/// A theme CSS without this selector has no light palette: applying it in light
/// mode would leave dark theme variables under light app chrome.
const LIGHT_THEME_SELECTOR: &str = r#"[data-theme="light"]"#;

fn main() {
    tauri_build::build();

    let themes_dir =
        std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("../src/styles/themes");

    let mut entries: Vec<String> = Vec::new();

    if let Ok(dir) = std::fs::read_dir(&themes_dir) {
        for entry in dir.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "css")
                && let Some(name) = path.file_stem().and_then(|s| s.to_str())
                && !name.starts_with('_')
            {
                entries.push(name.to_string());
            }
        }
    }

    entries.sort();

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let dest_path = std::path::Path::new(&out_dir).join("generated_themes.rs");

    let mut lookup_arms = String::new();
    let mut variant_entries = String::new();
    for name in &entries {
        lookup_arms.push_str(r#"        ""#);
        lookup_arms.push_str(name);
        lookup_arms.push_str(r#"" => Some(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/styles/themes/"#);
        lookup_arms.push_str(name);
        lookup_arms.push_str(
            r#".css"))),
"#,
        );

        let theme_path = themes_dir.join(format!("{name}.css"));
        let supports_light = std::fs::read_to_string(&theme_path)
            .map(|css| css.contains(LIGHT_THEME_SELECTOR))
            .unwrap_or(false);
        variant_entries.push_str(&format!("        ({name:?}, {supports_light}),\n"));
        println!("cargo::rerun-if-changed={}", theme_path.display());
    }

    let code = format!(
        r#"pub fn lookup_template_css(theme: &str) -> Option<&'static str> {{
    match theme {{
{lookup_arms}        _ => None,
    }}
}}

/// Bundled theme key paired with whether its CSS defines a light palette.
pub fn bundled_theme_variants() -> &'static [(&'static str, bool)] {{
    &[
{variant_entries}    ]
}}
"#,
        lookup_arms = lookup_arms,
        variant_entries = variant_entries,
    );

    std::fs::write(&dest_path, code).unwrap();

    println!("cargo::rerun-if-changed=../src/styles/themes/");
}
