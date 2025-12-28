use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TextOperation {
    #[serde(alias = "to-uppercase")]
    Uppercase,
    #[serde(alias = "to-lowercase")]
    Lowercase,
    InvertCase,
    RemoveAllSpaces,
    SentenceCase,
    CamelCase,
    PascalCase,
    SnakeCase,
    KebabCase,
    ConstantCase,
    #[serde(alias = "sort-lines")]
    SortAsc,
    SortDesc,
    SortCaseInsensitiveAsc,
    SortCaseInsensitiveDesc,
    SortNumericAsc,
    SortNumericDesc,
    SortLengthAsc,
    SortLengthDesc,
    Reverse,
    Shuffle,
    RemoveDuplicates,
    RemoveUnique,
    RemoveBlank,
    RemoveTrailingSpaces,
    RemoveLeadingSpaces,
    TitleCase,
    AddBullets,
    AddNumbers,
    AddCheckboxes,
    RemoveBullets,
    Blockquote,
    RemoveBlockquote,
    AddCodeFence,
    IncreaseHeading,
    DecreaseHeading,
    TrimWhitespace,
    NormalizeWhitespace,
    JoinLines,
    SplitSentences,
    WrapQuotes,
    AddLineNumbers,
    IndentLines,
    UnindentLines,
}

/// Performs text transformations
pub fn transform_text(
    text: &str,
    operation: TextOperation,
    indent_width: usize,
) -> Result<String, String> {
    match operation {
        // Case transformations (whole-text operations)
        TextOperation::Uppercase => Ok(text.to_uppercase()),
        TextOperation::Lowercase => Ok(text.to_lowercase()),

        TextOperation::InvertCase => Ok(text
            .chars()
            .map(|c| {
                if c.is_uppercase() {
                    c.to_lowercase().collect::<String>()
                } else {
                    c.to_uppercase().collect::<String>()
                }
            })
            .collect()),

        TextOperation::RemoveAllSpaces => Ok(text.chars().filter(|c| !c.is_whitespace()).collect()),

        TextOperation::SentenceCase => {
            let mut result = String::with_capacity(text.len());
            let mut capitalize_next = true;

            for c in text.chars() {
                if capitalize_next && c.is_alphabetic() {
                    result.push_str(&c.to_uppercase().to_string());
                    capitalize_next = false;
                } else {
                    result.push(c);
                    if c == '.' || c == '!' || c == '?' {
                        capitalize_next = true;
                    }
                }
            }
            Ok(result)
        }

        TextOperation::CamelCase => {
            let words: Vec<&str> = text.split_whitespace().collect();
            let mut result = String::new();
            for (i, word) in words.iter().enumerate() {
                if i == 0 {
                    result.push_str(&word.to_lowercase());
                } else {
                    let mut chars = word.chars();
                    if let Some(first) = chars.next() {
                        result.push_str(&first.to_uppercase().to_string());
                        result.push_str(&chars.as_str().to_lowercase());
                    }
                }
            }
            Ok(result)
        }

        TextOperation::PascalCase => {
            let words: Vec<&str> = text.split_whitespace().collect();
            let mut result = String::new();
            for word in words {
                let mut chars = word.chars();
                if let Some(first) = chars.next() {
                    result.push_str(&first.to_uppercase().to_string());
                    result.push_str(&chars.as_str().to_lowercase());
                }
            }
            Ok(result)
        }

        TextOperation::SnakeCase => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned
                .split_whitespace()
                .map(|w| w.to_lowercase())
                .collect::<Vec<_>>()
                .join("_"))
        }

        TextOperation::KebabCase => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned
                .split_whitespace()
                .map(|w| w.to_lowercase())
                .collect::<Vec<_>>()
                .join("-"))
        }

        TextOperation::ConstantCase => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned
                .split_whitespace()
                .map(|w| w.to_uppercase())
                .collect::<Vec<_>>()
                .join("_"))
        }

        // Line-based operations
        _ => transform_lines(text, operation, indent_width),
    }
}

/// Line-based text transformations
fn transform_lines(
    text: &str,
    operation: TextOperation,
    indent_width: usize,
) -> Result<String, String> {
    let lines: Vec<&str> = text.lines().collect();

    match operation {
        // Sort operations
        TextOperation::SortAsc => {
            let mut sorted = lines.clone();
            sorted.sort();
            Ok(sorted.join("\n"))
        }

        TextOperation::SortDesc => {
            let mut sorted = lines.clone();
            sorted.sort();
            sorted.reverse();
            Ok(sorted.join("\n"))
        }

        TextOperation::SortCaseInsensitiveAsc => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            Ok(sorted.join("\n"))
        }

        TextOperation::SortCaseInsensitiveDesc => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| b.to_lowercase().cmp(&a.to_lowercase()));
            Ok(sorted.join("\n"))
        }

        TextOperation::SortNumericAsc => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| {
                let num_a = extract_first_number(a).unwrap_or(0.0);
                let num_b = extract_first_number(b).unwrap_or(0.0);
                num_a
                    .partial_cmp(&num_b)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            Ok(sorted.join("\n"))
        }

        TextOperation::SortNumericDesc => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| {
                let num_a = extract_first_number(a).unwrap_or(0.0);
                let num_b = extract_first_number(b).unwrap_or(0.0);
                num_b
                    .partial_cmp(&num_a)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            Ok(sorted.join("\n"))
        }

        TextOperation::SortLengthAsc => {
            let mut sorted = lines.clone();
            sorted.sort_by_key(|a| a.len());
            Ok(sorted.join("\n"))
        }

        TextOperation::SortLengthDesc => {
            let mut sorted = lines.clone();
            sorted.sort_by_key(|a| std::cmp::Reverse(a.len()));
            Ok(sorted.join("\n"))
        }

        TextOperation::Reverse => {
            let mut reversed = lines.clone();
            reversed.reverse();
            Ok(reversed.join("\n"))
        }

        TextOperation::Shuffle => {
            use rand::seq::SliceRandom;
            let mut rng = rand::rng();
            let mut shuffled = lines.clone();
            shuffled.shuffle(&mut rng);
            Ok(shuffled.join("\n"))
        }

        // Remove operations
        TextOperation::RemoveDuplicates => {
            let mut seen = HashSet::new();
            let unique: Vec<&str> = lines
                .into_iter()
                .filter(|line| seen.insert(*line))
                .collect();
            Ok(unique.join("\n"))
        }

        TextOperation::RemoveUnique => {
            let mut counts = HashMap::new();
            for line in &lines {
                *counts.entry(*line).or_insert(0) += 1;
            }
            let duplicates: Vec<&str> = lines
                .into_iter()
                .filter(|line| counts.get(line).unwrap_or(&0) > &1)
                .collect();
            Ok(duplicates.join("\n"))
        }

        TextOperation::RemoveBlank => {
            let non_blank: Vec<&str> = lines
                .into_iter()
                .filter(|line| !line.trim().is_empty())
                .collect();
            Ok(non_blank.join("\n"))
        }

        TextOperation::RemoveTrailingSpaces => Ok(lines
            .iter()
            .map(|line| line.trim_end())
            .collect::<Vec<_>>()
            .join("\n")),

        TextOperation::RemoveLeadingSpaces => Ok(lines
            .iter()
            .map(|line| line.trim_start())
            .collect::<Vec<_>>()
            .join("\n")),

        // Case operations on lines
        TextOperation::TitleCase => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.split_whitespace()
                        .map(|word| {
                            let mut chars = word.chars();
                            match chars.next() {
                                Some(first) => {
                                    first.to_uppercase().collect::<String>()
                                        + &chars.as_str().to_lowercase()
                                }
                                None => String::new(),
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .collect();
            Ok(result.join("\n"))
        }

        // Markdown operations
        TextOperation::AddBullets => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("- {}", line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::AddNumbers => {
            let mut number = 1;
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        let formatted = format!("{}. {}", number, line);
                        number += 1;
                        formatted
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::AddCheckboxes => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("- [ ] {}", line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::RemoveBullets => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    let trimmed = line.trim_start();
                    // Remove bullets (-, *, +)
                    let step1 = trimmed
                        .strip_prefix("- ")
                        .or_else(|| trimmed.strip_prefix("* "))
                        .or_else(|| trimmed.strip_prefix("+ "))
                        .unwrap_or(trimmed);
                    // Remove numbers
                    let step2 = if let Some(pos) = step1.find(". ") {
                        if step1[..pos].chars().all(|c| c.is_numeric()) {
                            &step1[pos + 2..]
                        } else {
                            step1
                        }
                    } else {
                        step1
                    };
                    // Remove checkboxes
                    let step3 = step2
                        .strip_prefix("[ ] ")
                        .or_else(|| step2.strip_prefix("[x] "))
                        .or_else(|| step2.strip_prefix("[X] "))
                        .unwrap_or(step2);

                    step3.to_string()
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::Blockquote => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("> {}", line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::RemoveBlockquote => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.trim_start()
                        .strip_prefix("> ")
                        .unwrap_or(line.trim_start())
                        .to_string()
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::AddCodeFence => Ok(format!("```\n{}\n```", text)),

        TextOperation::IncreaseHeading => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.starts_with('#') && line.len() > 1 && line.chars().nth(1) == Some(' ') {
                        format!("#{}", line)
                    } else {
                        line.to_string()
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::DecreaseHeading => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.starts_with("##") {
                        line[1..].to_string()
                    } else {
                        line.to_string()
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        // Text manipulation
        TextOperation::TrimWhitespace => Ok(lines
            .iter()
            .map(|line| line.trim())
            .collect::<Vec<_>>()
            .join("\n")),

        TextOperation::NormalizeWhitespace => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::JoinLines => {
            let joined: Vec<String> = lines
                .iter()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .map(|l| l.to_string())
                .collect();
            Ok(joined.join(" "))
        }

        TextOperation::SplitSentences => {
            let mut result = String::new();
            let mut current_sentence = String::new();
            let mut chars = text.chars().peekable();

            while let Some(c) = chars.next() {
                current_sentence.push(c);
                if c == '.' || c == '!' || c == '?' {
                    // Peek next char to see if it's also punctuation (handle "..." or "?!")
                    let mut is_end = true;
                    if let Some(&next_c) = chars.peek() {
                        if next_c == '.' || next_c == '!' || next_c == '?' {
                            is_end = false;
                        }
                    }

                    if is_end {
                        let trimmed = current_sentence.trim();
                        if !trimmed.is_empty() {
                            if !result.is_empty() {
                                result.push('\n');
                            }
                            result.push_str(trimmed);
                        }
                        current_sentence.clear();
                    }
                }
            }

            let trimmed = current_sentence.trim();
            if !trimmed.is_empty() {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str(trimmed);
            }

            Ok(result)
        }

        TextOperation::WrapQuotes => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("\"{}\"", line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::AddLineNumbers => {
            let max_digits = lines.len().to_string().len();
            let result: Vec<String> = lines
                .iter()
                .enumerate()
                .map(|(i, line)| format!("{:>width$}. {}", i + 1, line, width = max_digits))
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::IndentLines => {
            let indent = " ".repeat(indent_width);
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("{}{}", indent, line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }

        TextOperation::UnindentLines => {
            let indent = " ".repeat(indent_width);
            let result: Vec<String> = lines
                .iter()
                .map(|line| line.strip_prefix(&indent).unwrap_or(line).to_string())
                .collect();
            Ok(result.join("\n"))
        }

        // Exhaustive matching implies no fallthrough to error for Enum,
        // but we'll include a pattern for good measure if needed, though strictly not needed with Enum
        _ => Err(format!("Operation not implemented: {:?}", operation)),
    }
}

/// Extracts the first number from a string
fn extract_first_number(s: &str) -> Option<f64> {
    let mut num_str = String::new();
    let mut found_digit = false;

    for c in s.chars() {
        if c.is_numeric() || c == '.' || c == '-' {
            num_str.push(c);
            if c.is_numeric() {
                found_digit = true;
            }
        } else if found_digit {
            break;
        }
    }

    if found_digit {
        num_str.parse().ok()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uppercase() {
        assert_eq!(
            transform_text("hello world", TextOperation::Uppercase, 4).unwrap(),
            "HELLO WORLD"
        );
    }

    #[test]
    fn test_indent_custom() {
        assert_eq!(
            transform_text("hello", TextOperation::IndentLines, 2).unwrap(),
            "  hello"
        );
    }
}
