macro_rules! lock_conn {
    ($self:expr) => {
        $self.conn.lock().unwrap_or_else(|e| e.into_inner())
    };
}

mod bookmarks;
mod database;
mod migrations;
mod recent_files;
mod session;

pub use bookmarks::Bookmark;
pub use database::Database;
pub use session::{SessionData, TabData, TabState};
