use std::fmt;

/// Supported frontmatter formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrontmatterFormat {
    /// YAML, delimited by `---`
    Yaml,
    /// TOML, delimited by `+++`
    Toml,
    /// JSON, delimited by `;;;` or curly braces
    Json,
}

impl fmt::Display for FrontmatterFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Yaml => write!(f, "yaml"),
            Self::Toml => write!(f, "toml"),
            Self::Json => write!(f, "json"),
        }
    }
}

/// A frontmatter block detected at the start of a document.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Frontmatter {
    pub format: FrontmatterFormat,
    /// Number of lines the block occupies (opening delimiter, body, closing delimiter).
    pub line_count: usize,
    /// Byte offset just past the closing delimiter line (where body content starts).
    pub end_offset: usize,
}

fn match_opening(line: &str) -> Option<FrontmatterFormat> {
    match line.trim_end() {
        "---" => Some(FrontmatterFormat::Yaml),
        "+++" => Some(FrontmatterFormat::Toml),
        ";;;" | "{" => Some(FrontmatterFormat::Json),
        _ => None,
    }
}

/// The closing delimiter that pairs with the given opening line.
///
/// The opening line must already be known to be a delimiter. JSON frontmatter
/// can be wrapped in either `;;;` or `{...}`; the closing line must match the
/// same style so a `}` inside a `;;;`-delimited body is not mistaken for the
/// closing delimiter. `{...}` blocks are closed by brace depth instead (see
/// [`extract_frontmatter`]), so this only pairs the exact-match delimiters.
fn closing_delimiter(opening: &str) -> &str {
    if opening.trim_end() == "{" {
        "}"
    } else {
        opening.trim_end()
    }
}

/// Detect a frontmatter block at the very start of a document.
///
/// The opening delimiter must be the first line (at column 0) and a matching
/// closing delimiter must appear later. A lone `---` thematic break without a
/// closing line is not treated as frontmatter.
///
/// YAML (`---`), TOML (`+++`) and `;;;`-delimited JSON close on the first
/// matching line. `{...}`-delimited JSON is closed by brace depth: the block
/// ends on the line where the brace count returns to zero, with double-quoted
/// strings skipped so `}` inside a string value is not mistaken for the
/// closing brace. This keeps nested objects from leaking the outer `}`.
pub fn extract_frontmatter(content: &str) -> Option<Frontmatter> {
    if content.is_empty() {
        return None;
    }

    let mut segments = content.split_inclusive('\n');
    let first = segments.next()?;
    let format = match_opening(first.trim_end())?;
    let closing = closing_delimiter(first.trim_end());

    let mut offset = first.len();
    // Brace-style JSON: the opening `{` counts as depth 1; exact-match
    // delimiters keep a depth of 0 so the `line == closing` check applies.
    let mut brace_depth = if format == FrontmatterFormat::Json && closing == "}" {
        1
    } else {
        0
    };
    let mut in_string = false;
    let mut escaped = false;

    // Opening delimiter is line 1; `line_count` tracks the current line number.
    for (line_count, segment) in (2..).zip(segments) {
        offset += segment.len();
        let line = segment.strip_suffix('\n').unwrap_or(segment);

        let is_closing = if brace_depth > 0 {
            for c in line.chars() {
                if in_string {
                    if escaped {
                        escaped = false;
                    } else if c == '\\' {
                        escaped = true;
                    } else if c == '"' {
                        in_string = false;
                    }
                } else {
                    match c {
                        '"' => in_string = true,
                        '{' => brace_depth += 1,
                        '}' => brace_depth -= 1,
                        _ => {},
                    }
                }
            }
            brace_depth == 0
        } else {
            line.trim_end() == closing
        };

        if is_closing {
            return Some(Frontmatter {
                format,
                line_count,
                end_offset: offset,
            });
        }
    }

    None
}

/// Replace the frontmatter block with the same number of blank lines.
///
/// This preserves the document's line numbering so comrak `data-sourcepos`
/// attributes (used for scroll sync) stay aligned with the editor, while the
/// blank lines themselves render no output.
pub fn blank_out(content: &str, fm: &Frontmatter) -> String {
    let mut out = String::with_capacity(content.len());
    out.extend(std::iter::repeat_n('\n', fm.line_count));
    out.push_str(&content[fm.end_offset..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_yaml_frontmatter() {
        let content = "---\ntitle: Test\ntags: [a, b]\n---\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Yaml);
        assert_eq!(fm.line_count, 4);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn detects_toml_frontmatter() {
        let content = "+++\ntitle = \"Test\"\n+++\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Toml);
        assert_eq!(fm.line_count, 3);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn detects_json_frontmatter_with_semicolons() {
        let content = ";;;\n{\"title\": \"Test\"}\n;;;\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 3);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn detects_pretty_printed_json_frontmatter_with_semicolons() {
        // The `}` body line must not be mistaken for the closing delimiter.
        let content = ";;;\n{\n  \"title\": \"Test\"\n}\n;;;\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 5);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn detects_json_frontmatter_with_braces() {
        let content = "{\n\"title\": \"Test\"\n}\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 3);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn detects_nested_json_frontmatter_with_braces() {
        // The inner object's `}` must not close the block; the outer `}`
        // closes it, so no stray brace leaks into the body.
        let content = "{\n\"author\": {\n\"name\": \"x\"\n}\n}\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 5);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn brace_json_ignores_braces_inside_strings() {
        let content = "{\n\"s\": \"a }\nb\"\n}\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 4);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn brace_json_closing_on_shared_line_with_content() {
        let content = "{\n\"a\": {\"b\": 1}}\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Json);
        assert_eq!(fm.line_count, 2);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn brace_json_without_closing_brace_is_ignored() {
        assert_eq!(extract_frontmatter("{\n\"title\": \"Test\"\n"), None);
    }

    #[test]
    fn ignores_doc_without_closing_delimiter() {
        assert_eq!(extract_frontmatter("---\ntitle: Test\n"), None);
        assert_eq!(extract_frontmatter("---"), None);
    }

    #[test]
    fn ignores_leading_whitespace() {
        assert_eq!(extract_frontmatter("  ---\ntitle: Test\n---\n"), None);
    }

    #[test]
    fn ignores_empty_and_plain_content() {
        assert_eq!(extract_frontmatter(""), None);
        assert_eq!(extract_frontmatter("# Just a heading\n"), None);
    }

    #[test]
    fn handles_empty_frontmatter_block() {
        let content = "---\n---\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.format, FrontmatterFormat::Yaml);
        assert_eq!(fm.line_count, 2);
        assert_eq!(&content[fm.end_offset..], "# Body\n");
    }

    #[test]
    fn handles_closing_delimiter_without_trailing_newline() {
        let content = "---\ntitle: Test\n---";
        let fm = extract_frontmatter(content).unwrap();
        assert_eq!(fm.line_count, 3);
        assert_eq!(fm.end_offset, content.len());
        assert_eq!(&content[fm.end_offset..], "");
    }

    #[test]
    fn blank_out_preserves_line_count() {
        let content = "---\ntitle: Test\n---\n# Body\n";
        let fm = extract_frontmatter(content).unwrap();
        let blanked = blank_out(content, &fm);
        assert_eq!(blanked, "\n\n\n# Body\n");
        assert_eq!(blanked.lines().count(), 4);
    }
}
