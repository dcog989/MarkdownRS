use DictCategory::*;

macro_rules! cspell_url {
    ($branch:literal, $path:literal) => {
        concat!(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/",
            $branch,
            "/dictionaries",
            $path
        )
    };
}

enum DictCategory {
    Technical,
    Scientific,
}

struct DictEntry {
    id: &'static str,
    url: &'static str,
    category: DictCategory,
}

static ALL_EXTRA_DICTS: &[DictEntry] = &[
    DictEntry {
        id: "medical-terms",
        url: cspell_url!("main", "/medicalterms/dict/medicalterms-en.txt"),
        category: Scientific,
    },
    DictEntry {
        id: "scientific-terms-us",
        url: cspell_url!(
            "main",
            "/scientific_terms_US/src/custom_scientific_US.dic.txt"
        ),
        category: Scientific,
    },
    DictEntry {
        id: "software-terms",
        url: cspell_url!("main", "/software-terms/dict/softwareTerms.txt"),
        category: Technical,
    },
    DictEntry {
        id: "companies",
        url: cspell_url!("main", "/companies/dict/companies.txt"),
        category: Technical,
    },
    DictEntry {
        id: "fullstack",
        url: cspell_url!("main", "/fullstack/dict/fullstack.txt"),
        category: Technical,
    },
    DictEntry {
        id: "filetypes",
        url: cspell_url!("main", "/filetypes/src/filetypes.txt"),
        category: Technical,
    },
];

pub fn resolve_technical_url(id: &str) -> Option<&'static str> {
    ALL_EXTRA_DICTS.iter().find(|e| e.id == id).map(|e| e.url)
}

pub fn list_technical_ids() -> Vec<String> {
    ALL_EXTRA_DICTS
        .iter()
        .filter(|e| matches!(e.category, Technical))
        .map(|e| e.id.to_string())
        .collect()
}

pub fn list_scientific_ids() -> Vec<String> {
    ALL_EXTRA_DICTS
        .iter()
        .filter(|e| matches!(e.category, Scientific))
        .map(|e| e.id.to_string())
        .collect()
}

pub fn resolve_language_urls(dict_code: &str) -> Option<(&'static str, &'static str)> {
    match dict_code {
        "en-US" => Some((
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.aff"
            ),
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.dic"
            ),
        )),
        "en-AU" => Some((
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.aff"
            ),
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.dic"
            ),
        )),
        "en-CA" => Some((
            cspell_url!(
                "refs/heads/main",
                "/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.aff"
            ),
            cspell_url!(
                "refs/heads/main",
                "/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.dic"
            ),
        )),
        "en-GB" => Some((
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.aff"
            ),
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.dic"
            ),
        )),
        "en-ZA" => Some((
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.aff"
            ),
            cspell_url!(
                "main",
                "/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.dic"
            ),
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_valid_url(s: &str) -> bool {
        s.starts_with("https://") && s.contains('.') && s.len() > 20
    }

    #[test]
    fn all_technical_urls_are_valid() {
        for id in list_technical_ids() {
            let url = resolve_technical_url(&id);
            assert!(url.is_some(), "Technical dictionary '{}' has no URL", id);
            assert!(
                is_valid_url(url.unwrap()),
                "Technical URL for '{}' is invalid",
                id
            );
        }
    }

    #[test]
    fn all_scientific_urls_are_valid() {
        for id in list_scientific_ids() {
            let url = resolve_technical_url(&id);
            assert!(url.is_some(), "Scientific dictionary '{}' has no URL", id);
            assert!(
                is_valid_url(url.unwrap()),
                "Scientific URL for '{}' is invalid",
                id
            );
        }
    }

    #[test]
    fn all_language_urls_are_valid() {
        for code in &["en-US", "en-AU", "en-CA", "en-GB", "en-ZA"] {
            let urls = resolve_language_urls(code);
            assert!(urls.is_some(), "Language '{}' has no URLs", code);
            let (aff_url, dic_url) = urls.unwrap();
            assert!(is_valid_url(aff_url), "Language {} aff URL invalid", code);
            assert!(is_valid_url(dic_url), "Language {} dic URL invalid", code);
        }
    }
}
