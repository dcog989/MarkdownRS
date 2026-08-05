use crate::markdown::callouts::transform_callouts;
use crate::markdown::linkify::{linkify_file_paths_ast, linkify_wikilinks_ast};
use crate::markdown::metrics::build_metrics;
use crate::markdown::{HeadingEntry, config::MarkdownFlavor, extract_headings_from_ast};
use anyhow::{Result, anyhow};
use comrak::{Anchorizer, Arena, format_html_with_plugins, options::Plugins, parse_document};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct MarkdownOptions {
    pub flavor: MarkdownFlavor,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
    pub widest_column: usize,
    pub headings: Vec<HeadingEntry>,
}

/// Renders markdown to HTML with line number tracking and document metrics
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult> {
    let comrak_options = options.flavor.to_comrak_options();

    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);

    linkify_wikilinks_ast(&arena, root);
    linkify_file_paths_ast(&arena, root);

    let headings = extract_headings_from_ast(root, &mut Anchorizer::new());

    let mut html = String::new();
    format_html_with_plugins(root, &comrak_options, &mut html, &Plugins::default())
        .map_err(|e| anyhow!("Failed to render markdown: {}", e))?;

    let html = transform_callouts(&html);

    let (line_count, word_count, char_count, widest_column) = build_metrics(content);

    Ok(RenderResult {
        html,
        line_count,
        word_count,
        char_count,
        widest_column,
        headings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::config::MarkdownFlavor;

    fn render_gfm(content: &str) -> String {
        render_markdown(
            content,
            MarkdownOptions {
                flavor: MarkdownFlavor::Gfm,
            },
        )
        .expect("render should succeed")
        .html
    }

    #[test]
    fn renders_dollar_math_with_math_style_attributes() {
        let html = render_gfm("Inline $x^2$ and display $$y = x + 1$$.\n");
        assert!(html.contains(r#"data-math-style="inline""#));
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains("x^2"));
        assert!(html.contains("y = x + 1"));
    }

    #[test]
    fn renders_latex_delimited_math() {
        let html = render_gfm(r"Inline \(a < b\) and display \[c = a\].\n");
        assert!(html.contains(r#"data-math-style="inline""#));
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains("a &lt; b"));
        assert!(html.contains("c = a"));
    }

    #[test]
    fn renders_math_code_fence() {
        let html = render_gfm("```math\nE = mc^2\n```\n");
        assert!(html.contains(r#"class="language-math" data-math-style="display""#));
        assert!(html.contains("E = mc^2"));
    }

    #[test]
    fn renders_multiline_display_math_block() {
        let html = render_gfm(
            "$$\n% \\f is defined as #1f(#2) using the macro\n\\f\\relax{x} = \\int_{-\\infty}^\\infty\n    \\f\\hat\\xi\\,e^{2 \\pi i \\xi x}\n    \\,d\\xi\n$$\n",
        );
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains(r"\f\relax{x} = \int_{-\infty}^\infty"));
    }

    #[test]
    fn leaves_plain_markdown_untouched() {
        let html = render_gfm("Hello *world*.\n");
        assert!(!html.contains("data-math-style"));
        assert!(html.contains("<em"));
    }

    #[test]
    fn renders_footnotes_with_definition_section() {
        let html = render_gfm("Hello[^1] world.\n\n[^1]: A footnote note.\n");
        assert!(html.contains(r#"class="footnote-ref""#));
        assert!(html.contains(r##"href="#fn-1""##));
        assert!(html.contains(r##"id="fn-1""##));
        assert!(html.contains("class=\"footnotes\""));
        assert!(html.contains("A footnote note."));
        assert!(html.contains("footnote-backref"));
    }
}
