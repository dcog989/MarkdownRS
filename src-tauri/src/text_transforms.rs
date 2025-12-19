use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Serialize, Deserialize)]
pub struct TransformOptions {
    pub operation: String,
}

/// Performs text transformations
pub fn transform_text(text: &str, operation: &str) -> Result<String, String> {
    match operation {
        // Case transformations (whole-text operations)
        "uppercase" | "to-uppercase" => Ok(text.to_uppercase()),
        "lowercase" | "to-lowercase" => Ok(text.to_lowercase()),
        
        "invert-case" => Ok(text
            .chars()
            .map(|c| {
                if c.is_uppercase() {
                    c.to_lowercase().collect::<String>()
                } else {
                    c.to_uppercase().collect::<String>()
                }
            })
            .collect()),
        
        "remove-all-spaces" => Ok(text.chars().filter(|c| !c.is_whitespace()).collect()),
        
        "sentence-case" => {
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
        
        "camel-case" => {
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
        
        "pascal-case" => {
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
        
        "snake-case" => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned.split_whitespace().map(|w| w.to_lowercase()).collect::<Vec<_>>().join("_"))
        }
        
        "kebab-case" => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned.split_whitespace().map(|w| w.to_lowercase()).collect::<Vec<_>>().join("-"))
        }
        
        "constant-case" => {
            let cleaned = text.replace(|c: char| !c.is_alphanumeric() && c != ' ', " ");
            Ok(cleaned.split_whitespace().map(|w| w.to_uppercase()).collect::<Vec<_>>().join("_"))
        }
        
        // Line-based operations
        _ => transform_lines(text, operation),
    }
}

/// Line-based text transformations
fn transform_lines(text: &str, operation: &str) -> Result<String, String> {
    let lines: Vec<&str> = text.lines().collect();
    
    match operation {
        // Sort operations
        "sort-asc" | "sort-lines" => {
            let mut sorted = lines.clone();
            sorted.sort();
            Ok(sorted.join("\n"))
        }
        
        "sort-desc" => {
            let mut sorted = lines.clone();
            sorted.sort();
            sorted.reverse();
            Ok(sorted.join("\n"))
        }
        
        "sort-numeric-asc" => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| {
                let num_a = extract_first_number(a).unwrap_or(0.0);
                let num_b = extract_first_number(b).unwrap_or(0.0);
                num_a.partial_cmp(&num_b).unwrap_or(std::cmp::Ordering::Equal)
            });
            Ok(sorted.join("\n"))
        }
        
        "sort-numeric-desc" => {
            let mut sorted = lines.clone();
            sorted.sort_by(|a, b| {
                let num_a = extract_first_number(a).unwrap_or(0.0);
                let num_b = extract_first_number(b).unwrap_or(0.0);
                num_b.partial_cmp(&num_a).unwrap_or(std::cmp::Ordering::Equal)
            });
            Ok(sorted.join("\n"))
        }
        
        "sort-length-asc" => {
            let mut sorted = lines.clone();
            sorted.sort_by_key(|a| a.len());
            Ok(sorted.join("\n"))
        }
        
        "sort-length-desc" => {
            let mut sorted = lines.clone();
            sorted.sort_by_key(|a| std::cmp::Reverse(a.len()));
            Ok(sorted.join("\n"))
        }
        
        "reverse" => {
            let mut reversed = lines.clone();
            reversed.reverse();
            Ok(reversed.join("\n"))
        }
        
        "shuffle" => {
            use rand::seq::SliceRandom;
            let mut rng = rand::thread_rng();
            let mut shuffled = lines.clone();
            shuffled.shuffle(&mut rng);
            Ok(shuffled.join("\n"))
        }
        
        // Remove operations
        "remove-duplicates" => {
            let mut seen = HashSet::new();
            let unique: Vec<&str> = lines.into_iter().filter(|line| seen.insert(*line)).collect();
            Ok(unique.join("\n"))
        }
        
        "remove-unique" => {
            let mut counts = HashMap::new();
            for line in &lines {
                *counts.entry(*line).or_insert(0) += 1;
            }
            let duplicates: Vec<&str> = lines.into_iter().filter(|line| counts.get(line).unwrap_or(&0) > &1).collect();
            Ok(duplicates.join("\n"))
        }
        
        "remove-blank" => {
            let non_blank: Vec<&str> = lines.into_iter().filter(|line| !line.trim().is_empty()).collect();
            Ok(non_blank.join("\n"))
        }
        
        "remove-trailing-spaces" => Ok(lines.iter().map(|line| line.trim_end()).collect::<Vec<_>>().join("\n")),
        
        "remove-leading-spaces" => Ok(lines.iter().map(|line| line.trim_start()).collect::<Vec<_>>().join("\n")),
        
        // Case operations on lines
        "title-case" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.split_whitespace()
                        .map(|word| {
                            let mut chars = word.chars();
                            match chars.next() {
                                Some(first) => {
                                    first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
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
        "add-bullets" => {
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
        
        "add-numbers" => {
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
        
        "add-checkboxes" => {
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
        
        "remove-bullets" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    let trimmed = line.trim_start();
                    // Remove bullets (-, *, +)
                    let step1 = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix("* ")).or_else(|| trimmed.strip_prefix("+ ")).unwrap_or(trimmed);
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
                    let step3 = step2.strip_prefix("[ ] ").or_else(|| step2.strip_prefix("[x] ")).or_else(|| step2.strip_prefix("[X] ")).unwrap_or(step2);
                    
                    step3.to_string()
                })
                .collect();
            Ok(result.join("\n"))
        }
        
        "blockquote" => {
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
        
        "remove-blockquote" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.trim_start().strip_prefix("> ").unwrap_or(line.trim_start()).to_string()
                })
                .collect();
            Ok(result.join("\n"))
        }
        
        "add-code-fence" => Ok(format!("```\n{}\n```", text)),
        
        "increase-heading" => {
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
        
        "decrease-heading" => {
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
        "trim-whitespace" => Ok(lines.iter().map(|line| line.trim()).collect::<Vec<_>>().join("\n")),
        
        "normalize-whitespace" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.split_whitespace().collect::<Vec<_>>().join(" ")
                })
                .collect();
            Ok(result.join("\n"))
        }
        
        "join-lines" => {
            let joined: Vec<String> = lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).map(|l| l.to_string()).collect();
            Ok(joined.join(" "))
        }
        
        "split-sentences" => {
            let full_text = text.to_string();
            let sentences: Vec<&str> = full_text
                .split(|c| c == '.' || c == '!' || c == '?')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(sentences.join("\n"))
        }
        
        "wrap-quotes" => {
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
        
        "add-line-numbers" => {
            let max_digits = lines.len().to_string().len();
            let result: Vec<String> = lines
                .iter()
                .enumerate()
                .map(|(i, line)| format!("{:>width$}. {}", i + 1, line, width = max_digits))
                .collect();
            Ok(result.join("\n"))
        }
        
        "indent-lines" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    if line.trim().is_empty() {
                        line.to_string()
                    } else {
                        format!("    {}", line)
                    }
                })
                .collect();
            Ok(result.join("\n"))
        }
        
        "unindent-lines" => {
            let result: Vec<String> = lines
                .iter()
                .map(|line| {
                    line.strip_prefix("    ").unwrap_or(line).to_string()
                })
                .collect();
            Ok(result.join("\n"))
        }
        
        _ => Err(format!("Unknown operation: {}", operation)),
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
        assert_eq!(transform_text("hello world", "uppercase").unwrap(), "HELLO WORLD");
    }

    #[test]
    fn test_lowercase() {
        assert_eq!(transform_text("HELLO WORLD", "lowercase").unwrap(), "hello world");
    }

    #[test]
    fn test_sort_asc() {
        assert_eq!(transform_text("zebra\napple\nbanana", "sort-asc").unwrap(), "apple\nbanana\nzebra");
    }

    #[test]
    fn test_remove_duplicates() {
        assert_eq!(transform_text("apple\nbanana\napple\ncherry", "remove-duplicates").unwrap(), "apple\nbanana\ncherry");
    }

    #[test]
    fn test_add_bullets() {
        assert_eq!(transform_text("item1\nitem2", "add-bullets").unwrap(), "- item1\n- item2");
    }

    #[test]
    fn test_reverse() {
        assert_eq!(transform_text("line1\nline2\nline3", "reverse").unwrap(), "line3\nline2\nline1");
    }
}
