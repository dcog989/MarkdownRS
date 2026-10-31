use crate::utils::{atomic_write, handle_error, run_blocking};
#[cfg(feature = "pdf-export")]
use pdf_oxide::api::Pdf;

/// First system font that covers CJK and other scripts the bundled Latin
/// fallback cannot draw.
#[cfg(feature = "pdf-export")]
const UNICODE_FONT_PATHS: &[&str] = &[
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "C:\\Windows\\Fonts\\msyh.ttc",
];

/// Fonts to register over pdf_oxide's bundled DejaVu. The markdown renderer asks
/// for these names on the Unicode path, and a later registration wins.
/// shortcut: fixed candidate paths, use fontconfig when more scripts matter.
#[cfg(feature = "pdf-export")]
fn unicode_fonts(content: &str) -> Vec<(String, Vec<u8>)> {
    if !content.chars().any(|character| character as u32 > 0xFF) {
        return Vec::new();
    }

    let Some((path, regular)) = UNICODE_FONT_PATHS
        .iter()
        .find_map(|path| std::fs::read(path).ok().map(|bytes| (*path, bytes)))
    else {
        return Vec::new();
    };

    // Headings and bold spans ask for the bold name; a regular face is better
    // than missing glyphs when no bold file exists next to it.
    let bold = std::fs::read(path.replace("-Regular", "-Bold")).unwrap_or_else(|_| regular.clone());

    vec![
        ("DejaVuSans".to_string(), regular),
        ("DejaVuSans-Bold".to_string(), bold),
    ]
}

/// Builds the document off the async runtime, then writes it atomically.
async fn write_export<F>(path: String, name: &'static str, file_kind: &'static str, build: F) -> Result<(), String>
where
    F: FnOnce() -> Result<Vec<u8>, String> + Send + 'static,
{
    crate::utils::validate_path_input(&path)?;

    let (bytes, duration) = crate::timed!({ run_blocking(name, build).await });
    let bytes = bytes.map_err(|e| {
        log::error!("[Export] {} failed: {}", name, e);
        e
    })?;

    let path_buf = std::path::PathBuf::from(&path);
    atomic_write(&path_buf, &bytes)
        .await
        .map_err(|e| handle_error(Some(&path), &format!("write {file_kind} file"), e))?;

    log::info!(
        "[Export] {} | duration={:?} | size={} bytes | path={}",
        name,
        duration,
        bytes.len(),
        path
    );

    Ok(())
}

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    write_export(path, "export_to_pdf", "PDF", move || {
        let fonts = unicode_fonts(&content);
        let mut pdf =
            Pdf::from_markdown_with_fonts(&content, &fonts).map_err(|e| format!("Failed to create PDF: {}", e))?;
        pdf.to_bytes()
            .map_err(|e| format!("Failed to generate PDF bytes: {}", e))
    })
    .await
}

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_docx(path: String, content: String) -> Result<(), String> {
    write_export(path, "export_to_docx", "DOCX", move || {
        let mut writer = std::io::Cursor::new(Vec::new());
        office_oxide::create::create_from_markdown_to_writer(&content, office_oxide::DocumentFormat::Docx, &mut writer)
            .map_err(|e| format!("Failed to create DOCX: {}", e))?;
        Ok(writer.into_inner())
    })
    .await
}

#[tauri::command]
pub async fn export_to_epub(
    path: String,
    content: String,
    title: String,
    flavor: Option<String>,
) -> Result<(), String> {
    let flavor = crate::markdown::config::MarkdownFlavor::from_option_str(flavor);
    write_export(path, "export_to_epub", "EPUB", move || {
        crate::export::epub::markdown_to_epub(&content, &title, flavor)
    })
    .await
}

#[tauri::command]
pub async fn export_to_latex(path: String, content: String, flavor: Option<String>) -> Result<(), String> {
    let flavor = crate::markdown::config::MarkdownFlavor::from_option_str(flavor);
    write_export(path, "export_to_latex", "LaTeX", move || {
        Ok(crate::export::latex::markdown_to_latex(&content, flavor).into_bytes())
    })
    .await
}

#[cfg(all(test, feature = "pdf-export"))]
mod tests {
    use super::*;

    #[test]
    fn skips_unicode_font_for_latin_content() {
        assert!(unicode_fonts("Hello world").is_empty());
    }

    #[test]
    fn registers_a_system_font_for_cjk_content() {
        if !UNICODE_FONT_PATHS
            .iter()
            .any(|path| std::path::Path::new(path).exists())
        {
            return;
        }

        let fonts = unicode_fonts("日本語");
        assert_eq!(fonts.len(), 2, "regular and bold must be registered");
        assert_eq!(fonts[0].0, "DejaVuSans");
        assert_eq!(fonts[1].0, "DejaVuSans-Bold");
    }
}
