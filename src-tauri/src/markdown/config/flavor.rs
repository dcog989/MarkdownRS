use comrak::Options;
use comrak::options::{Extension, Parse, Render};
use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter, IntoEnumIterator};

/// Markdown flavor specification (for comrak rendering)
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    Default,
    EnumIter,
    Display
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum MarkdownFlavor {
    /// Pure CommonMark (no extensions)
    CommonMark,
    /// GitHub Flavored Markdown (full GFM spec)
    #[default]
    Gfm,
}

impl MarkdownFlavor {
    /// All supported flavors in canonical order.
    pub fn all() -> Vec<String> {
        Self::iter().map(|f| f.to_string()).collect()
    }

    /// Convert string to MarkdownFlavor
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "commonmark" => Some(Self::CommonMark),
            "gfm" | "github" => Some(Self::Gfm),
            _ => None,
        }
    }

    /// Parse flavor from an optional string, returning default if None or invalid
    pub fn from_option_str(flavor: Option<String>) -> Self {
        flavor.and_then(|f| Self::from_str(&f)).unwrap_or_default()
    }

    /// Get central comrak options for this flavor
    pub fn to_comrak_options(self) -> Options<'static> {
        let mut options = Options {
            extension: match self {
                Self::CommonMark => Extension::default(),
                Self::Gfm => Extension {
                    strikethrough: true,
                    table: true,
                    autolink: true,
                    tasklist: true,
                    subscript: true,
                    footnotes: true,
                    math_dollars: true,
                    math_latex: true,
                    math_code: true,
                    ..Default::default()
                },
            },
            parse: Parse {
                smart: true,
                default_info_string: None,
                // A bare `---` under a line is a thematic break, not a setext H2.
                // Keeps rendering in step with the editor's disabled setext parser.
                ignore_setext: true,
                ..Default::default()
            },
            render: Render {
                r#unsafe: true,
                escape: false,
                sourcepos: true,
                ..Default::default()
            },
        };
        options.extension.header_id_prefix = Some(String::new());
        options
    }
}
