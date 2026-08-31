use std::path::PathBuf;
use std::process::{Child, Command};
use zeroize::Zeroizing;

#[derive(Debug)]
pub struct TransientLaunchPayload {
    pub username: Zeroizing<String>,
    pub secret: Zeroizing<String>,
}

impl TransientLaunchPayload {
    pub fn new(username: String, secret: String) -> Self { Self { username: Zeroizing::new(username), secret: Zeroizing::new(secret) } }
}

#[derive(Debug)]
pub struct LaunchRequest {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
}

#[derive(Debug, Default)]
pub struct SecureLauncher;

impl SecureLauncher {
    /// Launches only non-secret process arguments. Credential injection belongs
    /// to the platform-specific LCU channel; this method deliberately refuses
    /// to put passwords on a command line where other processes can inspect it.
    pub fn launch(&self, request: LaunchRequest, payload: TransientLaunchPayload) -> std::io::Result<Child> {
        let child = Command::new(request.executable).args(request.arguments).spawn();
        drop(payload);
        child
    }
}
