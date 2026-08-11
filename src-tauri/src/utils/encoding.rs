use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8};
use std::time::SystemTime;

pub fn format_system_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|t| {
        let datetime: DateTime<Local> = t.into();
        datetime.format("%Y%m%d / %H%M%S").to_string()
    })
}

pub fn decode_text(raw_bytes: Vec<u8>) -> (String, String, bool) {
    if let Some((encoding, _)) = Encoding::for_bom(&raw_bytes) {
        let (cow, _) = encoding.decode_with_bom_removal(&raw_bytes);
        return (cow.into_owned(), encoding.name().to_string(), true);
    }

    let (cow, _, had_errors) = UTF_8.decode(&raw_bytes);
    if !had_errors {
        return (cow.into_owned(), "UTF-8".to_string(), false);
    }

    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
    detector.feed(&raw_bytes, true);
    let detected = detector.guess(None, chardetng::Utf8Detection::Deny);
    let (cow, _, _) = detected.decode(&raw_bytes);
    (cow.into_owned(), detected.name().to_string(), false)
}

/// Re-encodes `text` into `encoding`, re-adding the BOM when `has_bom` is set.
///
/// Returns `Err(())` when the text contains characters the encoding cannot
/// represent (e.g. an emoji pasted into a windows-1252 file); callers must
/// fall back rather than silently mangling them.
pub fn encode_text(text: &str, encoding: &'static Encoding, has_bom: bool) -> Result<Vec<u8>, ()> {
    // encoding_rs treats UTF-16 as decode-only: its encoder emits UTF-8 (the
    // "output encoding"), so UTF-16 must be encoded manually. UTF-16 can
    // represent every Unicode scalar value, so this never fails.
    if encoding == encoding_rs::UTF_16LE || encoding == encoding_rs::UTF_16BE {
        let bom = if has_bom {
            bom_bytes_for(encoding)
        } else {
            &[]
        };
        return Ok(encode_utf16(text, bom, encoding == encoding_rs::UTF_16BE));
    }

    let mut encoder = encoding.new_encoder();
    let capacity = encoder
        .max_buffer_length_from_utf8_without_replacement(text.len())
        .ok_or(())?;
    let mut bytes = Vec::with_capacity(capacity);
    let (result, _) = encoder.encode_from_utf8_to_vec_without_replacement(text, &mut bytes, true);
    if !matches!(result, encoding_rs::EncoderResult::InputEmpty) {
        return Err(());
    }

    if has_bom {
        let mut with_bom = Vec::with_capacity(bytes.len() + 4);
        with_bom.extend_from_slice(bom_bytes_for(encoding));
        with_bom.extend_from_slice(&bytes);
        return Ok(with_bom);
    }
    Ok(bytes)
}

fn encode_utf16(text: &str, bom: &[u8], big_endian: bool) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(bom.len() + text.len() * 2);
    bytes.extend_from_slice(bom);
    for unit in text.encode_utf16() {
        if big_endian {
            bytes.extend_from_slice(&unit.to_be_bytes());
        } else {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
    }
    bytes
}

/// The byte-level BOM that precedes a file detected with a BOM, matching the
/// sequences recognized by `Encoding::for_bom`.
fn bom_bytes_for(encoding: &'static Encoding) -> &'static [u8] {
    if encoding == UTF_8 {
        b"\xEF\xBB\xBF"
    } else if encoding == encoding_rs::UTF_16LE {
        b"\xFF\xFE"
    } else if encoding == encoding_rs::UTF_16BE {
        b"\xFE\xFF"
    } else {
        &[]
    }
}

pub fn read_text_with_bom_detection(raw_bytes: Vec<u8>) -> String {
    decode_text(raw_bytes).0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_without_bom() {
        let (content, encoding, has_bom) = decode_text(b"hello".to_vec());
        assert_eq!(content, "hello");
        assert_eq!(encoding, "UTF-8");
        assert!(!has_bom);
    }

    #[test]
    fn decodes_utf8_bom_and_reports_bom() {
        let bytes = b"\xEF\xBB\xBFhello".to_vec();
        let (content, encoding, has_bom) = decode_text(bytes);
        assert_eq!(content, "hello");
        assert_eq!(encoding, "UTF-8");
        assert!(has_bom);
    }

    #[test]
    fn decodes_utf16le_bom() {
        let mut bytes = b"\xFF\xFE".to_vec();
        bytes.extend_from_slice(&[0x68, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F, 0x00]);
        let (content, encoding, has_bom) = decode_text(bytes);
        assert_eq!(content, "hello");
        assert_eq!(encoding, "UTF-16LE");
        assert!(has_bom);
    }

    #[test]
    fn encodes_utf16le_with_bom_round_trips() {
        let bytes = encode_text("hello", encoding_rs::UTF_16LE, true).unwrap();
        let mut expected = b"\xFF\xFE".to_vec();
        expected.extend_from_slice(&[0x68, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F, 0x00]);
        assert_eq!(bytes, expected);
    }

    #[test]
    fn encodes_utf8_with_bom() {
        let bytes = encode_text("hello", UTF_8, true).unwrap();
        assert_eq!(bytes, b"\xEF\xBB\xBFhello");
    }

    #[test]
    fn encode_without_bom_leaves_prefix_out() {
        let bytes = encode_text("hello", UTF_8, false).unwrap();
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn encodes_utf16be_with_bom_round_trips() {
        let bytes = encode_text("hello", encoding_rs::UTF_16BE, true).unwrap();
        let mut expected = b"\xFE\xFF".to_vec();
        expected.extend_from_slice(&[0x00, 0x68, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F]);
        assert_eq!(bytes, expected);
    }

    #[test]
    fn encodes_utf16_without_bom() {
        let bytes = encode_text("hi", encoding_rs::UTF_16LE, false).unwrap();
        assert_eq!(bytes, &[0x68, 0x00, 0x69, 0x00]);
    }

    #[test]
    fn encodes_non_bmp_utf16_as_surrogate_pair() {
        let bytes = encode_text("\u{1F600}", encoding_rs::UTF_16LE, false).unwrap();
        assert_eq!(bytes, &[0x3D, 0xD8, 0x00, 0xDE]);
    }

    #[test]
    fn encodes_windows_1252_round_trips() {
        // "café" in windows-1252 (é = 0xE9).
        let bytes = encode_text("caf\u{e9}", encoding_rs::WINDOWS_1252, false).unwrap();
        assert_eq!(bytes, b"caf\xE9");
    }

    #[test]
    fn encode_rejects_unrepresentable_characters() {
        let result = encode_text("caf\u{e9} \u{1F600}", encoding_rs::WINDOWS_1252, false);
        assert!(result.is_err());
    }
}
