//! Markdown to EPUB 3 conversion.
//!
//! The document body is the same HTML the preview renders, wrapped in an
//! XHTML shell and packaged with OPF metadata, a navigation document and CSS.
//! Raw HTML is dropped because the body must be well-formed XHTML. Local
//! images are referenced by their markdown path, not embedded.
//! shortcut: images are not embedded and links are not rewritten, embed them
//! when exported EPUBs need to be self-contained.

use crate::markdown::config::MarkdownFlavor;
use crate::markdown::renderer::{self, MarkdownOptions};
use std::io::{Cursor, Seek, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const MIMETYPE: &str = "application/epub+zip";

const CONTAINER: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"#;

const STYLESHEET: &str = r#"body { font-family: serif; line-height: 1.6; margin: 1em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
pre { background: #f4f4f4; padding: 0.75em; overflow-x: auto; white-space: pre-wrap; }
code { font-family: monospace; }
blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 0.25em 0.5em; }
img { max-width: 100%; }
"#;

pub fn markdown_to_epub(content: &str, title: &str, flavor: MarkdownFlavor) -> Result<Vec<u8>, String> {
    let rendered = renderer::render_markdown(
        content,
        MarkdownOptions {
            flavor,
            safe_html: true,
        },
    )
    .map_err(|e| format!("Failed to render markdown: {e}"))?;

    let title = title.trim();
    let title = if title.is_empty() { "Untitled" } else { title };
    let escaped_title = escape_xml(title);
    let identifier = format!("urn:uuid:{}", uuid::Uuid::new_v4());
    let modified = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");

    let content_xhtml = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>{escaped_title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
{html}
</body>
</html>
"#,
        html = rendered.html
    );

    let nav_items: String = if rendered.headings.is_empty() {
        format!(r#"<li><a href="content.xhtml">{escaped_title}</a></li>"#)
    } else {
        rendered
            .headings
            .iter()
            .map(|heading| {
                format!(
                    r#"<li><a href="content.xhtml#{}">{}</a></li>"#,
                    escape_xml(&heading.anchor_id),
                    escape_xml(&heading.text)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let nav_xhtml = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>{escaped_title}</title>
</head>
<body>
<nav epub:type="toc">
<h1>{escaped_title}</h1>
<ol>
{nav_items}
</ol>
</nav>
</body>
</html>
"#
    );

    let package_opf = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">{identifier}</dc:identifier>
    <dc:title>{escaped_title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>
"#
    );

    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    add_file(&mut zip, "mimetype", MIMETYPE.as_bytes())?;
    add_file(&mut zip, "META-INF/container.xml", CONTAINER.as_bytes())?;
    add_file(&mut zip, "OEBPS/content.opf", package_opf.as_bytes())?;
    add_file(&mut zip, "OEBPS/nav.xhtml", nav_xhtml.as_bytes())?;
    add_file(&mut zip, "OEBPS/content.xhtml", content_xhtml.as_bytes())?;
    add_file(&mut zip, "OEBPS/style.css", STYLESHEET.as_bytes())?;

    let cursor = zip.finish().map_err(|e| format!("Failed to finalize EPUB: {e}"))?;
    Ok(cursor.into_inner())
}

fn add_file<W: Write + Seek>(zip: &mut ZipWriter<W>, name: &str, data: &[u8]) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(name, options)
        .map_err(|e| format!("Failed to add {name} to EPUB: {e}"))?;
    zip.write_all(data)
        .map_err(|e| format!("Failed to write {name} to EPUB: {e}"))
}

fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn packages_mimetype_first_and_content() {
        let bytes =
            markdown_to_epub("# Title\n\nHello & goodbye.", "Title", MarkdownFlavor::Gfm).expect("epub should build");
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");

        assert_eq!(
            archive
                .by_index(0)
                .expect("first entry")
                .name()
                .expect("first entry name")
                .as_ref(),
            "mimetype"
        );
        let mut mimetype = String::new();
        archive
            .by_name("mimetype")
            .expect("mimetype entry")
            .read_to_string(&mut mimetype)
            .expect("read mimetype");
        assert_eq!(mimetype, MIMETYPE);

        let mut content = String::new();
        archive
            .by_name("OEBPS/content.xhtml")
            .expect("content entry")
            .read_to_string(&mut content)
            .expect("read content");
        assert!(content.contains(r#"<h1 id="title""#), "content was: {content}");
        assert!(content.contains("Hello &amp; goodbye."));
    }

    #[test]
    fn drops_raw_html_that_would_break_xhtml() {
        let bytes = markdown_to_epub("Hello <br> world", "Title", MarkdownFlavor::Gfm).expect("epub should build");
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");

        let mut content = String::new();
        archive
            .by_name("OEBPS/content.xhtml")
            .expect("content entry")
            .read_to_string(&mut content)
            .expect("read content");
        assert!(!content.contains("<br>"), "raw HTML leaked: {content}");
    }

    #[test]
    fn builds_a_toc_from_headings() {
        let bytes =
            markdown_to_epub("# One\n\nText\n\n## Two\n", "Book", MarkdownFlavor::Gfm).expect("epub should build");
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");

        let mut nav = String::new();
        archive
            .by_name("OEBPS/nav.xhtml")
            .expect("nav entry")
            .read_to_string(&mut nav)
            .expect("read nav");
        assert!(
            nav.contains(r#"<li><a href="content.xhtml#one">One</a></li>"#),
            "nav was: {nav}"
        );
        assert!(
            nav.contains(r#"<li><a href="content.xhtml#two">Two</a></li>"#),
            "nav was: {nav}"
        );
    }

    #[test]
    fn escapes_the_document_title_in_metadata() {
        let bytes = markdown_to_epub("Body", "A & B <C>", MarkdownFlavor::Gfm).expect("epub should build");
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");

        let mut package = String::new();
        archive
            .by_name("OEBPS/content.opf")
            .expect("package entry")
            .read_to_string(&mut package)
            .expect("read package");
        assert!(
            package.contains("<dc:title>A &amp; B &lt;C&gt;</dc:title>"),
            "package was: {package}"
        );
    }
}
