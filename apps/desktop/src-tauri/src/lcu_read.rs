//! Read-only local League connection. Credentials stay ephemeral and confined to loopback.
use reqwest::blocking::Client;
use std::{fs, io::Read, time::Duration};
const JSON_LIMIT: usize = 8 * 1024 * 1024;

pub(crate) struct LcuConnection {
    port: u16,
    password: zeroize::Zeroizing<String>,
    client: Client,
}
fn command_argument(arguments: &[String], name: &str) -> Option<String> {
    arguments.iter().enumerate().find_map(|(index, value)| {
        value
            .strip_prefix(&format!("{name}="))
            .map(str::to_string)
            .or_else(|| {
                (value == name)
                    .then(|| arguments.get(index + 1).cloned())
                    .flatten()
            })
    })
}
pub(crate) fn connection() -> Result<Option<LcuConnection>, String> {
    let system = sysinfo::System::new_all();
    let mut saw_client = false;
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_lowercase();
        if ![
            "leagueclient",
            "leagueclient.exe",
            "leagueclientux",
            "leagueclientux.exe",
        ]
        .contains(&name.as_str())
        {
            continue;
        }
        saw_client = true;
        let args: Vec<String> = process
            .cmd()
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let credentials = command_argument(&args, "--app-port")
            .zip(command_argument(&args, "--remoting-auth-token"));
        let credentials = credentials.or_else(|| {
            for directory in process.exe()?.ancestors().skip(1).take(8) {
                let Ok(contents) = fs::read_to_string(directory.join("lockfile")) else {
                    continue;
                };
                let fields: Vec<_> = contents.trim().split(':').collect();
                if fields.len() == 5 && fields[4] == "https" {
                    return Some((fields[2].into(), fields[3].into()));
                }
            }
            None
        });
        if let Some((port, password)) = credentials {
            let port = port
                .parse::<u16>()
                .map_err(|_| "Invalid local League port".to_string())?;
            if port == 0 || password.is_empty() {
                continue;
            }
            // LCU uses a self-signed loopback certificate. This exception is confined
            // to this client: host is hardcoded, proxies/redirects are disabled, credentials never leave localhost.
            let client = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .danger_accept_invalid_certs(true)
                .timeout(Duration::from_secs(3))
                .build()
                .map_err(|_| "Unable to connect to local League client".to_string())?;
            return Ok(Some(LcuConnection {
                port,
                password: zeroize::Zeroizing::new(password),
                client,
            }));
        }
    }
    if saw_client {
        Err("Cannot read League Client connection details. Restart League or run both apps with matching permissions.".into())
    } else {
        Ok(None)
    }
}
impl LcuConnection {
    pub(crate) fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        let response = self
            .client
            .get(format!("https://127.0.0.1:{}{path}", self.port))
            .basic_auth("riot", Some(self.password.as_str()))
            .send()
            .map_err(|_| "League client is not ready yet".to_string())?
            .error_for_status()
            .map_err(|_| "League client has no active login yet".to_string())?;
        let mut bytes = Vec::new();
        response
            .take((JSON_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "Unable to read local League response".to_string())?;
        if bytes.len() > JSON_LIMIT {
            return Err("Local League response too large".into());
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| "Invalid response from local League client".into())
    }
}
