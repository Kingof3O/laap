fn main() {
    println!("cargo:rerun-if-env-changed=LAAP_LIVE_WORKER_URL");
    println!("cargo:rerun-if-env-changed=LAAP_LIVE_WORKER_TOKEN");
    tauri_build::build();
}
