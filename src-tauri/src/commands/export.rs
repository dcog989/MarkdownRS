use crate::utils::{atomic_write, handle_error, run_blocking};
#[cfg(feature = "pdf-export")]
use pdf_oxide::api::Pdf;

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (pdf_bytes, duration) = crate::timed!({
        run_blocking("export PDF", move || {
            let mut pdf = Pdf::from_markdown(&content).map_err(|e| format!("Failed to create PDF: {}", e))?;
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
