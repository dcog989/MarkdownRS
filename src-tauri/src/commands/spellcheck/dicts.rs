use DictCategory::*;

enum DictCategory {
    Technical,
    Scientific,
}

struct DictEntry {
    id: &'static str,
    url: &'static str,
    category: DictCategory,
}

static ALL_TECHNICAL_DICTS: &[DictEntry] = &[
    DictEntry {
        id: "medical-terms",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medicalterms/dict/medicalterms-en.txt",
        category: Scientific,
    },
    DictEntry {
        id: "scientific-terms-us",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific_terms_US/src/custom_scientific_US.dic.txt",
        category: Scientific,
    },
    DictEntry {
        id: "software-terms",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/software-terms/dict/softwareTerms.txt",
        category: Technical,
    },
    DictEntry {
        id: "companies",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/companies/dict/companies.txt",
        category: Technical,
    },
    DictEntry {
        id: "fullstack",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/fullstack/dict/fullstack.txt",
        category: Technical,
    },
    DictEntry {
        id: "filetypes",
        url: "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/filetypes/src/filetypes.txt",
        category: Technical,
    },
];

pub fn resolve_technical_url(id: &str) -> Option<&'static str> {
    ALL_TECHNICAL_DICTS
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.url)
}

pub fn list_technical_ids() -> Vec<String> {
    ALL_TECHNICAL_DICTS
        .iter()
        .filter(|e| matches!(e.category, Technical))
        .map(|e| e.id.to_string())
        .collect()
}

pub fn list_scientific_ids() -> Vec<String> {
    ALL_TECHNICAL_DICTS
        .iter()
        .filter(|e| matches!(e.category, Scientific))
        .map(|e| e.id.to_string())
        .collect()
}

pub fn resolve_language_urls(dict_code: &str) -> Option<(&'static str, &'static str)> {
    match dict_code {
        "en-US" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.dic",
        )),
        "en-AU" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.dic",
        )),
        "en-CA" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/refs/heads/main/dictionaries/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/refs/heads/main/dictionaries/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.dic",
        )),
        "en-GB" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.dic",
        )),
        "en-ZA" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.dic",
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
