//! Markdown to LaTeX conversion for document export.
//!
//! Covers the GFM constructs the editor renders: headings, emphasis, code,
//! lists, tables, links, images, math and footnotes. Raw HTML is dropped,
//! since there is no faithful LaTeX equivalent.

use crate::markdown::config::MarkdownFlavor;
use crate::markdown::frontmatter;
use comrak::nodes::{AstNode, ListType, NodeValue, TableAlignment};
use comrak::{Arena, parse_document};

const PREAMBLE: &str = r"\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{hyperref}
\usepackage{graphicx}
\usepackage[normalem]{ulem}
";

pub fn markdown_to_latex(content: &str) -> String {
    let body = frontmatter::extract_frontmatter(content)
        .map(|fm| frontmatter::blank_out(content, &fm))
        .unwrap_or_else(|| content.to_string());

    let options = MarkdownFlavor::Gfm.to_comrak_options();
    let arena = Arena::new();
    let root = parse_document(&arena, &body, &options);
    let mut out = String::with_capacity(body.len() * 2);
    render_blocks(root, &mut out);

    format!(
        "{PREAMBLE}\n\\begin{{document}}\n\n{}\n\\end{{document}}\n",
        out.trim_end()
    )
}

fn render_blocks<'a>(parent: &'a AstNode<'a>, out: &mut String) {
    for node in parent.children() {
        render_block(node, out);
    }
}

fn render_block<'a>(node: &'a AstNode<'a>, out: &mut String) {
    match node.data.borrow().value.clone() {
        NodeValue::Paragraph => {
            render_inlines(node, out);
            out.push_str("\n\n");
        },
        NodeValue::Heading(heading) => {
            let command = match heading.level {
                1 => "section",
                2 => "subsection",
                3 => "subsubsection",
                4 => "paragraph",
                _ => "subparagraph",
            };
            out.push('\\');
            out.push_str(command);
            out.push('{');
            render_inlines(node, out);
            out.push_str("}\n\n");
        },
        NodeValue::BlockQuote | NodeValue::MultilineBlockQuote(_) => {
            out.push_str("\\begin{quote}\n");
            render_blocks(node, out);
            out.push_str("\\end{quote}\n\n");
        },
        NodeValue::List(list) => {
            let environment = match list.list_type {
                ListType::Bullet => "itemize",
                ListType::Ordered => "enumerate",
            };
            out.push_str("\\begin{");
            out.push_str(environment);
            out.push_str("}\n");
            render_blocks(node, out);
            out.push_str("\\end{");
            out.push_str(environment);
            out.push_str("}\n\n");
        },
        NodeValue::Item(_) => {
            out.push_str("\\item ");
            render_blocks(node, out);
        },
        NodeValue::TaskItem(task) => {
            out.push_str("\\item ");
            out.push_str(if task.symbol.is_some() {
                "[x] "
            } else {
                "[ ] "
            });
            render_inlines(node, out);
            out.push('\n');
        },
        NodeValue::CodeBlock(code) => {
            out.push_str("\\begin{verbatim}\n");
            out.push_str(code.literal.trim_end_matches('\n'));
            out.push_str("\n\\end{verbatim}\n\n");
        },
        NodeValue::ThematicBreak => out.push_str("\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n\n"),
        NodeValue::Table(_) => render_table(node, out),
        NodeValue::Math(math) if math.display_math => {
            out.push_str("\\[\n");
            out.push_str(&math.literal);
            out.push_str("\n\\]\n\n");
        },
        NodeValue::DescriptionTerm => {
            render_inlines(node, out);
            out.push_str("\n\n");
        },
        NodeValue::DescriptionDetails => render_blocks(node, out),
        NodeValue::HtmlBlock(_) | NodeValue::FrontMatter(_) => {},
        _ => render_blocks(node, out),
    }
}

fn render_table<'a>(node: &'a AstNode<'a>, out: &mut String) {
    let alignments = match &node.data.borrow().value {
        NodeValue::Table(table) => table.alignments.clone(),
        _ => return,
    };
    let columns: String = alignments
        .iter()
        .map(|alignment| match alignment {
            TableAlignment::Center => 'c',
            TableAlignment::Right => 'r',
            _ => 'l',
        })
        .collect();

    out.push_str("\\begin{table}[h]\n\\centering\n\\begin{tabular}{");
    out.push_str(&columns);
    out.push_str("}\n");

    for row in node.children() {
        let is_header = matches!(row.data.borrow().value, NodeValue::TableRow(true));
        for (index, cell) in row.children().enumerate() {
            if index > 0 {
                out.push_str(" & ");
            }
            render_inlines(cell, out);
        }
        out.push_str(" \\\\\n");
        if is_header {
            out.push_str("\\hline\n");
        }
    }

    out.push_str("\\end{tabular}\n\\end{table}\n\n");
}

fn render_inlines<'a>(parent: &'a AstNode<'a>, out: &mut String) {
    for node in parent.children() {
        render_inline(node, out);
    }
}

fn render_inline<'a>(node: &'a AstNode<'a>, out: &mut String) {
    match node.data.borrow().value.clone() {
        NodeValue::Text(text) => out.push_str(&escape_text(&text)),
        NodeValue::SoftBreak => out.push('\n'),
        NodeValue::LineBreak => out.push_str("\\\\\n"),
        NodeValue::Code(code) => {
            out.push_str("\\texttt{");
            out.push_str(&escape_text(&code.literal));
            out.push('}');
        },
        NodeValue::Emph => wrap(node, out, "\\emph{"),
        NodeValue::Strong => wrap(node, out, "\\textbf{"),
        NodeValue::Strikethrough => wrap(node, out, "\\sout{"),
        NodeValue::Underline => wrap(node, out, "\\underline{"),
        NodeValue::Superscript => wrap(node, out, "\\textsuperscript{"),
        NodeValue::Subscript => wrap(node, out, "\\textsubscript{"),
        NodeValue::Link(link) => {
            out.push_str("\\href{");
            out.push_str(&escape_url(&link.url));
            out.push_str("}{");
            render_inlines(node, out);
            out.push('}');
        },
        NodeValue::WikiLink(link) if !link.embed => {
            out.push_str("\\href{");
            out.push_str(&escape_url(&link.url));
            out.push_str("}{");
            render_inlines(node, out);
            out.push('}');
        },
        NodeValue::Image(link) => {
            out.push_str("\\includegraphics[width=\\linewidth]{\\detokenize{");
            out.push_str(&link.url);
            out.push_str("}}");
        },
        NodeValue::Math(math) if math.display_math => {
            out.push_str("\\[");
            out.push_str(&math.literal);
            out.push_str("\\]");
        },
        NodeValue::Math(math) => {
            out.push('$');
            out.push_str(&math.literal);
            out.push('$');
        },
        NodeValue::FootnoteReference(reference) => {
            out.push_str("\\textsuperscript{");
            out.push_str(&escape_text(&reference.name));
            out.push('}');
        },
        NodeValue::HtmlInline(_) | NodeValue::Raw(_) | NodeValue::ShortCode(_) => {},
        _ => render_inlines(node, out),
    }
}

fn wrap<'a>(node: &'a AstNode<'a>, out: &mut String, open: &str) {
    out.push_str(open);
    render_inlines(node, out);
    out.push('}');
}

/// hyperref reads its URL argument in a special mode: only these four characters
/// still need a backslash, and a text command like `\textasciitilde{}` breaks the link.
fn escape_url(url: &str) -> String {
    let mut out = String::with_capacity(url.len());
    for character in url.chars() {
        match character {
            '%' | '#' | '&' | '_' => {
                out.push('\\');
                out.push(character);
            },
            _ => out.push(character),
        }
    }
    out
}

fn escape_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '\\' => out.push_str("\\textbackslash{}"),
            '{' => out.push_str("\\{"),
            '}' => out.push_str("\\}"),
            '&' => out.push_str("\\&"),
            '%' => out.push_str("\\%"),
            '$' => out.push_str("\\$"),
            '#' => out.push_str("\\#"),
            '_' => out.push_str("\\_"),
            '~' => out.push_str("\\textasciitilde{}"),
            '^' => out.push_str("\\textasciicircum{}"),
            _ => out.push(character),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_core_markdown_constructs() {
        let latex = markdown_to_latex(
            "# Title\n\nSome **bold** and `code` with 50% & more.\n\n- one\n- two\n\n```rust\nfn main() {}\n```\n\n[site](https://example.com/a_b)\n",
        );

        assert!(latex.contains("\\section{Title}"));
        assert!(latex.contains("\\textbf{bold}"));
        assert!(latex.contains("\\texttt{code}"));
        assert!(latex.contains("50\\% \\& more"));
        assert!(latex.contains("\\begin{itemize}"));
        assert!(latex.contains("\\item one"));
        assert!(latex.contains("\\begin{verbatim}\nfn main() {}\n\\end{verbatim}"));
        assert!(latex.contains("\\href{https://example.com/a\\_b}{site}"));
        assert!(latex.contains("\\end{document}"));
    }

    #[test]
    fn keeps_url_tilde_and_query_intact() {
        let latex = markdown_to_latex("[home](https://example.com/~user/?a=1&b=two%20words)\n");

        assert!(
            latex.contains("\\href{https://example.com/~user/?a=1\\&b=two\\%20words}{home}"),
            "latex was: {latex}"
        );
    }
}
