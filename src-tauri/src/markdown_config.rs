use comrak::options::Extension;
use serde::{Deserialize, Serialize};

/// Markdown flavor specification
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MarkdownFlavor {
    /// Pure CommonMark (no extensions)
    CommonMark,
    /// GitHub Flavored Markdown (full GFM spec)
    GFM,
}

impl Default for MarkdownFlavor {
    fn default() -> Self {
        Self::GFM
    }
}

impl MarkdownFlavor {
    /// Convert string to MarkdownFlavor
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "commonmark" | "common-mark" | "cm" => Some(Self::CommonMark),
            "gfm" | "github" => Some(Self::GFM),
            _ => None,
        }
    }

    /// Get comrak extension options for this flavor
    pub fn to_extension_options(&self) -> Extension<'static> {
        match self {
            Self::CommonMark => Extension {
                strikethrough: false,
                tagfilter: false,
                table: false,
                autolink: false,
                tasklist: false,
                superscript: false,
                header_ids: None,
                footnotes: false,
                inline_footnotes: false,
                description_lists: false,
                front_matter_delimiter: None,
                multiline_block_quotes: false,
                alerts: false,
                math_dollars: false,
                math_code: false,
                shortcodes: false,
                wikilinks_title_after_pipe: false,
                wikilinks_title_before_pipe: false,
                underline: false,
                subscript: false,
                spoiler: false,
                greentext: false,
                image_url_rewriter: None,
                link_url_rewriter: None,
                cjk_friendly_emphasis: false,
                subtext: false,
                highlight: false,
                phoenix_heex: false,
            },
            Self::GFM => Extension {
                strikethrough: true,
                tagfilter: true,
                table: true,
                autolink: true,
                tasklist: true,
                superscript: false,
                header_ids: None,
                footnotes: false,
                inline_footnotes: false,
                description_lists: false,
                front_matter_delimiter: None,
                multiline_block_quotes: false,
                alerts: false,
                math_dollars: false,
                math_code: false,
                shortcodes: false,
                wikilinks_title_after_pipe: false,
                wikilinks_title_before_pipe: false,
                underline: false,
                subscript: true,
                spoiler: false,
                greentext: false,
                image_url_rewriter: None,
                link_url_rewriter: None,
                cjk_friendly_emphasis: false,
                subtext: false,
                highlight: false,
                phoenix_heex: false,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flavor_from_string() {
        assert_eq!(
            MarkdownFlavor::from_str("commonmark"),
            Some(MarkdownFlavor::CommonMark)
        );
        assert_eq!(
            MarkdownFlavor::from_str("gfm"),
            Some(MarkdownFlavor::GFM)
        );
        assert_eq!(
            MarkdownFlavor::from_str("github"),
            Some(MarkdownFlavor::GFM)
        );
        assert_eq!(MarkdownFlavor::from_str("invalid"), None);
    }

    #[test]
    fn test_commonmark_extensions() {
        let opts = MarkdownFlavor::CommonMark.to_extension_options();
        assert!(!opts.subscript);
    }

    #[test]
    fn test_gfm_extensions() {
        let opts = MarkdownFlavor::GFM.to_extension_options();
        assert!(opts.subscript);
    }

    #[test]
    fn test_default_flavor() {
        assert_eq!(MarkdownFlavor::default(), MarkdownFlavor::GFM);
    }
}
