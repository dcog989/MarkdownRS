use crate::utils::handle_error;
use pdfrs::elements;
use pdfrs::elements::{Element, TextSegment};
use pdfrs::pdf_generator;

/// Replaces bullet characters (•, ●) with "- " in all text content of parsed
/// markdown elements, while leaving code blocks, inline code, math, image paths,
/// and link URLs untouched.
fn replace_bullets_in_elements(elements: &mut [Element]) {
    for element in elements.iter_mut() {
        match element {
            Element::Heading { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::Paragraph { text } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::RichParagraph { segments } => {
                for segment in segments.iter_mut() {
                    match segment {
                        TextSegment::Plain(s)
                        | TextSegment::Bold(s)
                        | TextSegment::Italic(s)
                        | TextSegment::BoldItalic(s) => {
                            *s = s.replace(['•', '●'], "- ");
                        },
                        TextSegment::Link { text, .. } => {
                            *text = text.replace(['•', '●'], "- ");
                        },
                        TextSegment::Code(_) => {},
                    }
                }
            },
            Element::UnorderedListItem { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::OrderedListItem { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::TaskListItem { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::TableRow { cells, .. } => {
                for cell in cells.iter_mut() {
                    *cell = cell.replace(['•', '●'], "- ");
                }
            },
            Element::BlockQuote { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::DefinitionItem {
                term, definition, ..
            } => {
                *term = term.replace(['•', '●'], "- ");
                *definition = definition.replace(['•', '●'], "- ");
            },
            Element::Footnote { label, text, .. } => {
                *label = label.replace(['•', '●'], "- ");
                *text = text.replace(['•', '●'], "- ");
            },
            Element::Link { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            Element::StyledText { text, .. } => {
                *text = text.replace(['•', '●'], "- ");
            },
            // Leave code, math, and image metadata untouched
            Element::CodeBlock { .. }
            | Element::InlineCode { .. }
            | Element::Image { .. }
            | Element::MathBlock { .. }
            | Element::MathInline { .. }
            | Element::PageBreak
            | Element::HorizontalRule
            | Element::EmptyLine => {},
        }
    }
}

#[tauri::command]
pub async fn export_to_pdf(path: String, content: String) -> Result<(), String> {
    crate::utils::validate_path(&path)?;

    let start = std::time::Instant::now();

    let mut parsed_elements = elements::parse_markdown(&content);
    replace_bullets_in_elements(&mut parsed_elements);

    let layout = pdf_generator::PageLayout::portrait();

    let pdf_bytes = pdf_generator::generate_pdf_bytes(&parsed_elements, "Helvetica", 12.0, layout)
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    let path_buf = std::path::PathBuf::from(&path);
    crate::utils::atomic_write(&path_buf, &pdf_bytes)
        .await
        .map_err(|e| handle_error(Some(&path), "write PDF file", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Export] export_to_pdf | duration={:?} | size={} bytes | path={}",
        duration,
        pdf_bytes.len(),
        path
    );

    Ok(())
}
