pub fn resolve_technical_url(id: &str) -> Option<&'static str> {
    match id {
        "medical-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medicalterms/dict/medicalterms-en.txt",
        ),
        "scientific-terms-us" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific_terms_US/src/custom_scientific_US.dic.txt",
        ),
        "software-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/software-terms/dict/softwareTerms.txt",
        ),
        "companies" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/companies/dict/companies.txt",
        ),
        "fullstack" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/fullstack/dict/fullstack.txt",
        ),
        "filetypes" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/filetypes/src/filetypes.txt",
        ),
        _ => None,
    }
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

pub fn list_technical_ids() -> Vec<String> {
    vec![
        "software-terms".to_string(),
        "companies".to_string(),
        "fullstack".to_string(),
        "filetypes".to_string(),
    ]
}

pub fn list_scientific_ids() -> Vec<String> {
    vec![
        "medical-terms".to_string(),
        "scientific-terms-us".to_string(),
    ]
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
