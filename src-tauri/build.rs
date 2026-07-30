fn main() {
    let themes_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../src/styles/themes");

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

    let mut theme_entries = String::new();
    for name in &entries {
        theme_entries.push_str(r#"    (""#);
        theme_entries.push_str(name);
        theme_entries.push_str(
            r#"", include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/styles/themes/"#,
        );
        theme_entries.push_str(name);
        theme_entries.push_str(
            r#".css"))),
"#,
        );
    }

    let mut lookup_arms = String::new();
    for name in &entries {
        lookup_arms.push_str(r#"        ""#);
        lookup_arms.push_str(name);
        lookup_arms.push_str(
            r#"" => Some(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/styles/themes/"#,
        );
        lookup_arms.push_str(name);
        lookup_arms.push_str(
            r#".css"))),
"#,
        );
    }

    let code = format!(
        r#"pub const TEMPLATE_THEMES: &[(&str, &str)] = &[
{theme_entries}];

pub fn lookup_template_css(theme: &str) -> Option<&'static str> {{
    match theme {{
{lookup_arms}        _ => None,
    }}
}}
"#,
        theme_entries = theme_entries,
        lookup_arms = lookup_arms,
    );

    std::fs::write(&dest_path, code).unwrap();

    println!("cargo::rerun-if-changed=../src/styles/themes/");
}
