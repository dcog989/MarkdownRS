use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub(crate) fn make_temp_dir(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!("markdownrs-test-{}-{}", name, Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}
