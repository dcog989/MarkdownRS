use crate::state::AppState;
use crate::utils::MutexExt;
use std::path::PathBuf;

mod flavor;
mod rumdl;

pub use flavor::*;
pub use rumdl::*;

pub struct ResolvedPaths {
    pub file_path: Option<PathBuf>,
    pub project_root: Option<PathBuf>,
}

pub fn resolve_paths(file_path: Option<&str>, state: &AppState) -> ResolvedPaths {
    ResolvedPaths {
        file_path: file_path.map(PathBuf::from),
        project_root: state.project_root.lock_or_recover().clone(),
    }
}
