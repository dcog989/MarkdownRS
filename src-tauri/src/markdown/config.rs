use comrak::Options;
use comrak::options::{Extension, Parse, Render};
use serde::{Deserialize, Serialize};

pub const DEFAULT_LIST_INDENT: usize = 2;
pub const DEFAULT_MAX_BLANK_LINES: usize = 2;

/// Markdown flavor specification
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    Default
)]
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
            "commonmark" | "common-mark" | "cm" => Some(Self::CommonMark),
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
        Options {
            extension: match self {
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
                Self::Gfm => Extension {
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
            },
            parse: Parse {
                smart: true,
                default_info_string: None,
                ..Default::default()
            },
            render: Render {
                r#unsafe: false,
                escape: false,
                sourcepos: true,
                ..Default::default()
            },
        }
    }
}
