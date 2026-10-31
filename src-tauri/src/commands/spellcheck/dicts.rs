use DictCategory::*;

/// Replaces the `main` branch with a commit: an upstream push must not change
/// what the app parses. Bump this (and `DICT_CACHE_VERSION`) to take updates.
macro_rules! cspell_url {
    ($path:literal) => {
        concat!(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/ae9c8d4dc15024377cc64b21d77ce863a35e0c9d/dictionaries",
            $path
        )
    };
}

/// Pinned commit of the fallback dictionary repository.
const WOOORM_COMMIT: &str = "8cfea406b505e4d7df52d5a19bce525df98c54ab";

/// Languages served from wooorm/dictionaries. Every code offered in
/// `DictionarySelector.svelte` must be pinned below or listed here; the test at
/// the bottom of this file enforces it.
const WOOORM_LANGUAGES: &[&str] = &[
    "bg", "ca", "cs", "cy", "da", "de", "de-AT", "de-CH", "el", "en", "eo", "es", "et", "eu", "fa", "fr", "gd", "gl",
    "he", "hr", "hu", "hy", "is", "it", "ko", "la", "lt", "lv", "mk", "mn", "nb", "nl", "nn", "pl", "pt", "ro", "ru",
    "sk", "sl", "sr", "sv", "tr", "uk", "vi",
];

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
        url: cspell_url!("/medicalterms/dict/medicalterms-en.txt"),
        category: Scientific,
    },
    DictEntry {
        id: "scientific-terms-us",
        url: cspell_url!("/scientific_terms_US/src/custom_scientific_US.dic.txt"),
        category: Scientific,
    },
    DictEntry {
        id: "software-terms",
        url: cspell_url!("/software-terms/dict/softwareTerms.txt"),
        category: Technical,
    },
    DictEntry {
        id: "companies",
        url: cspell_url!("/companies/dict/companies.txt"),
        category: Technical,
    },
    DictEntry {
        id: "fullstack",
        url: cspell_url!("/fullstack/dict/fullstack.txt"),
        category: Technical,
    },
    DictEntry {
        id: "filetypes",
        url: cspell_url!("/filetypes/src/filetypes.txt"),
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

fn pinned_language_urls(dict_code: &str) -> Option<(&'static str, &'static str)> {
    match dict_code {
        "en-US" => Some((
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.aff"),
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.dic"),
        )),
        "en-AU" => Some((
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.aff"),
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.dic"),
        )),
        "en-CA" => Some((
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.aff"),
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.dic"),
        )),
        "en-GB" => Some((
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.aff"),
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.dic"),
        )),
        "en-ZA" => Some((
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.aff"),
            cspell_url!("/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.dic"),
        )),
        "fi" => Some((
            cspell_url!("/fi_FI/src/hunspell/fi_FI.aff"),
            cspell_url!("/fi_FI/src/hunspell/fi_FI.dic"),
        )),
        "id" => Some((
            cspell_url!("/id_ID/src/hunspell/id_ID.aff"),
            cspell_url!("/id_ID/src/hunspell/id_ID.dic"),
        )),
        "pt-BR" => Some((
            cspell_url!("/pt_BR/src/hunspell/index.aff"),
            cspell_url!("/pt_BR/src/hunspell/index.dic"),
        )),
        _ => None,
    }
}

pub fn resolve_language_urls(dict_code: &str) -> Option<(String, String)> {
    if let Some((aff, dic)) = pinned_language_urls(dict_code) {
        return Some((aff.to_string(), dic.to_string()));
    }
    WOOORM_LANGUAGES.contains(&dict_code).then(|| {
        let base =
            format!("https://raw.githubusercontent.com/wooorm/dictionaries/{WOOORM_COMMIT}/dictionaries/{dict_code}");
        (format!("{base}/index.aff"), format!("{base}/index.dic"))
    })
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
            assert!(is_valid_url(url.unwrap()), "Technical URL for '{}' is invalid", id);
        }
    }

    #[test]
    fn all_scientific_urls_are_valid() {
        for id in list_scientific_ids() {
            let url = resolve_technical_url(&id);
            assert!(url.is_some(), "Scientific dictionary '{}' has no URL", id);
            assert!(is_valid_url(url.unwrap()), "Scientific URL for '{}' is invalid", id);
        }
    }

    #[test]
    fn all_language_urls_are_valid() {
        for code in &["en-US", "en-AU", "en-CA", "en-GB", "en-ZA", "fi", "id", "pt-BR"] {
            let urls = resolve_language_urls(code);
            assert!(urls.is_some(), "Language '{}' has no URLs", code);
            let (aff_url, dic_url) = urls.unwrap();
            assert!(is_valid_url(&aff_url), "Language {} aff URL invalid", code);
            assert!(is_valid_url(&dic_url), "Language {} dic URL invalid", code);
        }
    }

    #[test]
    fn unknown_language_has_no_urls() {
        assert!(resolve_language_urls("zz").is_none());
    }

    /// The picker is the user-facing list; the resolver is the URL source. A
    /// language added to the picker without a source used to fail only at
    /// download time, after the user selected it.
    #[test]
    fn every_picker_language_resolves() {
        const PICKER: &str = include_str!("../../../../src/lib/components/ui/DictionarySelector.svelte");
        let codes: Vec<&str> = PICKER
            .match_indices("code: \"")
            .map(|(start, found)| {
                let rest = &PICKER[start + found.len()..];
                &rest[..rest.find('"').expect("unterminated dictionary code")]
            })
            .collect();

        assert!(
            !codes.is_empty(),
            "no dictionary codes found in DictionarySelector.svelte"
        );
        for code in codes {
            assert!(
                resolve_language_urls(code).is_some(),
                "language '{}' is offered in the picker but has no dictionary source",
                code
            );
        }
    }
}
