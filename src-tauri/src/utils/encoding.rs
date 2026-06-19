use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8};
use std::time::SystemTime;

pub fn format_system_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|t| {
        let datetime: DateTime<Local> = t.into();
        datetime.format("%Y%m%d / %H%M%S").to_string()
    })
}

pub fn decode_text(raw_bytes: Vec<u8>) -> (String, String) {
    if let Some((encoding, _)) = Encoding::for_bom(&raw_bytes) {
        let (cow, _) = encoding.decode_with_bom_removal(&raw_bytes);
        return (cow.into_owned(), encoding.name().to_string());
    }

    let (cow, _, had_errors) = UTF_8.decode(&raw_bytes);
    if !had_errors {
        return (cow.into_owned(), "UTF-8".to_string());
    }

    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
    detector.feed(&raw_bytes, true);
    let detected = detector.guess(None, chardetng::Utf8Detection::Deny);
    let (cow, _, _) = detected.decode(&raw_bytes);
    (cow.into_owned(), detected.name().to_string())
}

pub fn read_text_with_bom_detection(raw_bytes: Vec<u8>) -> String {
    decode_text(raw_bytes).0
}
