use tauri::WebviewWindow;

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    // Calling window.close() triggers WindowEvent::CloseRequested on the window,
    // which is intercepted by on_window_event in lib.rs to safely hide to tray.
    window.close().map_err(|e| e.to_string())
}

pub fn is_allowed_external_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return false;
    }

    let host = parsed.host_str().unwrap_or_default();
    let is_github_repo = host == "github.com" && {
        if let Some(mut segments) = parsed.path_segments() {
            segments.next() == Some("Kingof3O") && segments.next() == Some("laap")
        } else {
            false
        }
    };
    let is_opgg = host == "op.gg" || host == "www.op.gg" || host.ends_with(".op.gg");

    let is_configured_help_url = [
        option_env!("VITE_LAAP_SUPPORT_URL"),
        option_env!("VITE_LAAP_PRIVACY_URL"),
        option_env!("VITE_LAAP_TERMS_URL"),
        option_env!("VITE_LAAP_RELEASE_NOTES_URL"),
    ]
    .into_iter()
    .flatten()
    .any(|allowed| allowed.trim() == url);

    is_github_repo || is_opgg || is_configured_help_url
}

/// Opens an external URL in the user's default system browser.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("External URL is not allowed".to_string());
    }
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid external URL.")?;
    open_browser(&parsed)
}

pub(crate) fn open_browser(url: &reqwest::Url) -> Result<(), String> {
    let url = url.as_str();
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        let wide_url: Vec<u16> = url.encode_utf16().chain([0]).collect();
        // ShellExecute passes the URL to the registered HTTPS handler without a command shell.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                std::ptr::null(),
                wide_url.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            return Err("Windows could not open the HTTPS link.".into());
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::is_allowed_external_url;

    #[test]
    fn allows_github_laap_repository() {
        assert!(is_allowed_external_url("https://github.com/Kingof3O/laap"));
        assert!(is_allowed_external_url("https://github.com/Kingof3O/laap/releases"));
    }

    #[test]
    fn allows_opgg_summoner_urls() {
        assert!(is_allowed_external_url("https://op.gg/lol/summoners/euw/Kingof3O-EUW"));
        assert!(is_allowed_external_url("https://www.op.gg/lol/summoners/eune/Player-EUNE"));
    }

    #[test]
    fn rejects_unauthorized_urls() {
        assert!(!is_allowed_external_url("http://op.gg/lol/summoners/euw/Kingof3O-EUW"));
        assert!(!is_allowed_external_url("https://github.com/other/repo"));
        assert!(!is_allowed_external_url("https://evil.com/fake-opgg"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
    }
}
