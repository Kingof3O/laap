//! Windows uses Schannel; macOS decodes the legacy PFX into a rustls server identity.
#[derive(Clone)]
pub enum ChatIdentity {
    #[cfg(not(target_os = "macos"))]
    Native(native_tls::Identity),
    #[cfg(target_os = "macos")]
    Rustls(std::sync::Arc<rustls::ServerConfig>),
}
pub fn load(bytes: &[u8]) -> Result<ChatIdentity, String> {
    #[cfg(target_os = "macos")]
    {
        use openssl::{pkcs12::Pkcs12, provider::Provider};
        let _default = Provider::load(None, "default")
            .map_err(|_| "Unable to initialize certificate decoder".to_string())?;
        let _legacy = Provider::load(None, "legacy")
            .map_err(|_| "Unable to load legacy certificate decoder".to_string())?;
        let parsed = Pkcs12::from_der(bytes)
            .and_then(|p| p.parse2(""))
            .map_err(|_| "Invalid presence certificate package".to_string())?;
        let key = parsed.pkey.ok_or("Certificate key is missing")?;
        let leaf = parsed.cert.ok_or("Certificate chain is missing")?;
        let mut chain = vec![rustls::pki_types::CertificateDer::from(
            leaf.to_der()
                .map_err(|_| "Unable to decode leaf certificate")?,
        )];
        if let Some(certs) = parsed.ca {
            for cert in certs {
                chain.push(rustls::pki_types::CertificateDer::from(
                    cert.to_der()
                        .map_err(|_| "Unable to decode certificate chain")?,
                ));
            }
        }
        let key = rustls::pki_types::PrivatePkcs8KeyDer::from(
            key.private_key_to_pkcs8()
                .map_err(|_| "Unable to decode certificate key")?,
        );
        let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());
        let config = rustls::ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|_| "Unable to configure local TLS versions")?
            .with_no_client_auth()
            .with_single_cert(chain, key.into())
            .map_err(|_| "Certificate/key mismatch")?;
        Ok(ChatIdentity::Rustls(std::sync::Arc::new(config)))
    }
    #[cfg(not(target_os = "macos"))]
    {
        native_tls::Identity::from_pkcs12(bytes, "")
            .map(ChatIdentity::Native)
            .map_err(|e| format!("Unable to import presence certificate: {e}"))
    }
}
pub trait ChatIo: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send> ChatIo for T {}
#[derive(Clone)]
pub enum ChatAcceptor {
    #[cfg(not(target_os = "macos"))]
    Native(tokio_native_tls::TlsAcceptor),
    #[cfg(target_os = "macos")]
    Rustls(tokio_rustls::TlsAcceptor),
}
impl ChatIdentity {
    pub fn acceptor(&self) -> Result<ChatAcceptor, String> {
        match self {
            #[cfg(not(target_os = "macos"))]
            Self::Native(identity) => {
                Ok(ChatAcceptor::Native(tokio_native_tls::TlsAcceptor::from(
                    native_tls::TlsAcceptor::new(identity.clone()).map_err(|e| e.to_string())?,
                )))
            }
            #[cfg(target_os = "macos")]
            Self::Rustls(config) => Ok(ChatAcceptor::Rustls(tokio_rustls::TlsAcceptor::from(
                config.clone(),
            ))),
        }
    }
    pub fn accept_blocking(&self, stream: std::net::TcpStream) -> Result<(), String> {
        match self {
            #[cfg(not(target_os = "macos"))]
            Self::Native(identity) => native_tls::TlsAcceptor::new(identity.clone())
                .map_err(|e| e.to_string())?
                .accept(stream)
                .map(|_| ())
                .map_err(|e| e.to_string()),
            #[cfg(target_os = "macos")]
            Self::Rustls(config) => {
                let mut stream = stream;
                let mut connection =
                    rustls::ServerConnection::new(config.clone()).map_err(|e| e.to_string())?;
                while connection.is_handshaking() {
                    connection
                        .complete_io(&mut stream)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            }
        }
    }
}
impl ChatAcceptor {
    pub async fn accept(&self, stream: tokio::net::TcpStream) -> Result<Box<dyn ChatIo>, String> {
        match self {
            #[cfg(not(target_os = "macos"))]
            Self::Native(acceptor) => acceptor
                .accept(stream)
                .await
                .map(|s| Box::new(s) as Box<dyn ChatIo>)
                .map_err(|e| e.to_string()),
            #[cfg(target_os = "macos")]
            Self::Rustls(acceptor) => acceptor
                .accept(stream)
                .await
                .map(|s| Box::new(s) as Box<dyn ChatIo>)
                .map_err(|e| e.to_string()),
        }
    }
}
