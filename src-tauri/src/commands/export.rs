use crate::utils::handle_error;
#[cfg(feature = "pdf-export")]
use pdf_oxide::api::Pdf;

#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (pdf_size, duration) = crate::timed!({
        let mut pdf = Pdf::from_markdown(&content).map_err(|e| format!("Failed to create PDF: {}", e))?;
        let pdf_bytes = pdf
            .to_bytes()
            .map_err(|e| format!("Failed to generate PDF bytes: {}", e))?;

        let path_buf = std::path::PathBuf::from(&path);
        crate::utils::atomic_write(&path_buf, &pdf_bytes)
            .await
            .map_err(|e| handle_error(Some(&path), "write PDF file", e))?;

        pdf_bytes.len()
    });

    log::info!(
        "[Export] export_to_pdf | duration={:?} | size={} bytes | path={}",
        duration,
        pdf_size,
        path
    );

    Ok(())
}

#[cfg(feature = "pdf-export")]
#[tauri::command]
pub async fn export_to_docx(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (docx_size, duration) = crate::timed!({
        let mut writer = std::io::Cursor::new(Vec::new());
        office_oxide::create::create_from_markdown_to_writer(&content, office_oxide::DocumentFormat::Docx, &mut writer)
            .map_err(|e| format!("Failed to create DOCX: {}", e))?;
        let docx_bytes = writer.into_inner();

        let path_buf = std::path::PathBuf::from(&path);
        crate::utils::atomic_write(&path_buf, &docx_bytes)
            .await
            .map_err(|e| handle_error(Some(&path), "write DOCX file", e))?;

        docx_bytes.len()
    });

    log::info!(
        "[Export] export_to_docx | duration={:?} | size={} bytes | path={}",
        duration,
        docx_size,
        path
    );

    Ok(())
}

#[tauri::command]
pub async fn export_to_epub(path: String, content: String, title: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (epub_size, duration) = crate::timed!({
        let epub_bytes = crate::export::epub::markdown_to_epub(&content, &title)?;

        let path_buf = std::path::PathBuf::from(&path);
        crate::utils::atomic_write(&path_buf, &epub_bytes)
            .await
            .map_err(|e| handle_error(Some(&path), "write EPUB file", e))?;

        epub_bytes.len()
    });

    log::info!(
        "[Export] export_to_epub | duration={:?} | size={} bytes | path={}",
        duration,
        epub_size,
        path
    );

    Ok(())
}

#[tauri::command]
pub async fn export_to_latex(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path_input(&path)?;

    let (latex_size, duration) = crate::timed!({
        let latex = crate::export::latex::markdown_to_latex(&content);

        let path_buf = std::path::PathBuf::from(&path);
        crate::utils::atomic_write(&path_buf, latex.as_bytes())
            .await
            .map_err(|e| handle_error(Some(&path), "write LaTeX file", e))?;

        latex.len()
    });

    log::info!(
        "[Export] export_to_latex | duration={:?} | size={} bytes | path={}",
        duration,
        latex_size,
        path
    );

    Ok(())
}
