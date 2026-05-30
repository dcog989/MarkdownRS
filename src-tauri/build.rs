fn main() {
    // Ensure cargo re-runs this build script when the frontend assets change.
    // tauri_build::build() tracks tauri.conf.json but not the frontendDist
    // directory contents, so a manual rerun-if-changed is required.
    println!("cargo:rerun-if-changed=../build");
    tauri_build::build()
}
