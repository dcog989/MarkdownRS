use crate::utils::handle_file_error;
use pdfrs::elements;
use pdfrs::pdf_generator;

#[tauri::command]
pub async fn export_to_pdf(
    path: String,
    content: String,
    title: String,
    background_color: Option<String>,
) -> Result<(), String> {
    crate::utils::validate_path(&path)?;

    let start = std::time::Instant::now();

    let processed_content = content.replace(['•', '●'], "- ");

    let parsed_elements = elements::parse_markdown(&processed_content);

    let layout = pdf_generator::PageLayout::portrait();

    let pdf_bytes = pdf_generator::generate_pdf_bytes(&parsed_elements, "Helvetica", 12.0, layout)
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    let path_buf = std::path::PathBuf::from(&path);
    crate::utils::atomic_write(&path_buf, &pdf_bytes)
        .await
        .map_err(|e| handle_file_error(&path, "write PDF file", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Export] export_to_pdf | duration={:?} | size={} bytes | bg={:?} | title={} | path={}",
        duration,
        pdf_bytes.len(),
        background_color,
        title,
        path
    );

    Ok(())
}
