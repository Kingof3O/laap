fn main() {
    println!("cargo:rerun-if-env-changed=LAAP_LIVE_WORKER_URL");
    println!("cargo:rerun-if-env-changed=LAAP_LIVE_WORKER_TOKEN");
    println!("cargo:rerun-if-env-changed=LAAP_BILLING_ORIGIN");
    println!("cargo:rerun-if-env-changed=LAAP_BILLING_PUBLIC_KEY");
    tauri_build::build();
}
