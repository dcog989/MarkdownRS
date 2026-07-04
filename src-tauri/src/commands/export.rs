use crate::utils::handle_error;
use pdf_oxide::api::Pdf;

#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path(&path)?;

    let (pdf_size, duration) = crate::timed!({
        let mut pdf =
            Pdf::from_markdown(&content).map_err(|e| format!("Failed to create PDF: {}", e))?;
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
