pub fn get_target_platform() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x86_64"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x86_64"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "unknown"
    }
}

pub fn parse_semver(v: &str) -> (u64, u64, u64) {
    let clean = v.trim_start_matches('v').trim();
    let parts: Vec<u64> = clean
        .split('.')
        .map(|s| s.parse::<u64>().unwrap_or(0))
        .collect();
    (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    )
}

pub fn is_newer(remote: &str, current: &str) -> bool {
    let (r_maj, r_min, r_pat) = parse_semver(remote);
    let (c_maj, c_min, c_pat) = parse_semver(current);
    if r_maj != c_maj {
        r_maj > c_maj
    } else if r_min != c_min {
        r_min > c_min
    } else {
        r_pat > c_pat
    }
}
