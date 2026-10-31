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

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (pdf_bytes, duration) = crate::timed!({
        run_blocking("export PDF", move || {
            let fonts = unicode_fonts(&content);
            let mut pdf =
                Pdf::from_markdown_with_fonts(&content, &fonts).map_err(|e| format!("Failed to create PDF: {}", e))?;
            pdf.to_bytes()
                .map_err(|e| format!("Failed to generate PDF bytes: {}", e))
        })
        .await
    });
    let pdf_bytes = pdf_bytes?;

    let path_buf = std::path::PathBuf::from(&path);
    atomic_write(&path_buf, &pdf_bytes)
        .await
        .map_err(|e| handle_error(Some(&path), "write PDF file", e))?;

    log::info!(
        "[Export] export_to_pdf | duration={:?} | size={} bytes | path={}",
        duration,
        pdf_bytes.len(),
        path
    );

    Ok(())
}

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_docx(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (docx_bytes, duration) = crate::timed!({
        run_blocking("export DOCX", move || {
            let mut writer = std::io::Cursor::new(Vec::new());
            office_oxide::create::create_from_markdown_to_writer(
                &content,
                office_oxide::DocumentFormat::Docx,
                &mut writer,
            )
            .map_err(|e| format!("Failed to create DOCX: {}", e))?;
            Ok(writer.into_inner())
        })
        .await
    });
    let docx_bytes = docx_bytes?;

    let path_buf = std::path::PathBuf::from(&path);
    atomic_write(&path_buf, &docx_bytes)
        .await
        .map_err(|e| handle_error(Some(&path), "write DOCX file", e))?;

    log::info!(
        "[Export] export_to_docx | duration={:?} | size={} bytes | path={}",
        duration,
        docx_bytes.len(),
        path
    );

    Ok(())
}

#[tauri::command]
pub async fn export_to_epub(path: String, content: String, title: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (epub_bytes, duration) = crate::timed!({
        run_blocking("export EPUB", move || {
            crate::export::epub::markdown_to_epub(&content, &title)
        })
        .await
    });
    let epub_bytes = epub_bytes?;

    let path_buf = std::path::PathBuf::from(&path);
    atomic_write(&path_buf, &epub_bytes)
        .await
        .map_err(|e| handle_error(Some(&path), "write EPUB file", e))?;

    log::info!(
        "[Export] export_to_epub | duration={:?} | size={} bytes | path={}",
        duration,
        epub_bytes.len(),
        path
    );

    Ok(())
}

#[tauri::command]
pub async fn export_to_latex(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (latex, duration) = crate::timed!({
        run_blocking("export LaTeX", move || {
            Ok(crate::export::latex::markdown_to_latex(&content))
        })
        .await
    });
    let latex = latex?;

    let path_buf = std::path::PathBuf::from(&path);
    atomic_write(&path_buf, latex.as_bytes())
        .await
        .map_err(|e| handle_error(Some(&path), "write LaTeX file", e))?;

    log::info!(
        "[Export] export_to_latex | duration={:?} | size={} bytes | path={}",
        duration,
        latex.len(),
        path
    );

    Ok(())
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
