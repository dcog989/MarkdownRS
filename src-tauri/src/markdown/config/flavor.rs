use comrak::Options;
use serde::{Deserialize, Serialize};

/// Markdown flavor specification (for comrak rendering)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "lowercase")]
pub enum MarkdownFlavor {
    /// Pure CommonMark (no extensions)
    CommonMark,
    /// GitHub Flavored Markdown (full GFM spec)
    #[default]
    Gfm,
}

impl MarkdownFlavor {
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
        let mut options = Options::default();

        if let Self::Gfm = self {
            options.extension.strikethrough = true;
            options.extension.table = true;
            options.extension.autolink = true;
            options.extension.tasklist = true;
            options.extension.subscript = true;
            options.extension.footnotes = true;
            options.extension.math_dollars = true;
            options.extension.math_dollars_block = true;
            options.extension.math_latex = true;
            options.extension.math_code = true;
        }

        options.parse.smart = true;
        options.render.r#unsafe = true;
        options.render.escape = false;
        options.render.sourcepos = true;
        options.extension.header_id_prefix = Some(String::new());
        options
    }
}
