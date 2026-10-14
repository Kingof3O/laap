//! LAAP's own loopback-only configuration and TLS chat proxy.
//! Presence payloads stay in memory; authentication and chat are never logged.
use crate::{
    launcher_settings::PresenceMode,
    presence_protocol::{self, Frames},
};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, Method, StatusCode},
    response::Response,
    Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use native_tls::{Identity, TlsAcceptor, TlsConnector};
use std::{
    net::{Ipv4Addr, TcpListener},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::watch,
};
pub const LOCAL_CHAT_DOMAIN: &str = "deceive-localhost.molenzwiebel.xyz";
const CONFIG_ORIGIN: &str = "https://clientconfig.rpg.riotgames.com";
const AFFINITY_URL: &str = "https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat";
const LIMIT: usize = 8 * 1024 * 1024;
#[derive(Clone)]
struct Endpoint {
    host: String,
    port: u16,
}
#[derive(Default, Clone)]
pub struct Progress {
    pub applied: Option<PresenceMode>,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub routed: bool,
}
pub struct Proxy {
    pub mode: watch::Sender<PresenceMode>,
    shutdown: watch::Sender<bool>,
    endpoint: Mutex<Option<Endpoint>>,
    progress: Mutex<Progress>,
    connections: AtomicUsize,
    pub config_port: u16,
    chat_port: u16,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
    client: reqwest::Client,
}
impl Proxy {
    pub fn progress(&self) -> Progress {
        self.progress
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    pub fn set_notice(&self, message: &str) {
        self.progress
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .notice = Some(message.into());
    }
    pub fn error(&self, message: &str) {
        self.progress
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .error = Some(message.into());
    }
    pub fn change_mode(&self, mode: PresenceMode) {
        let mut progress = self.progress.lock().unwrap_or_else(|e| e.into_inner());
        progress.notice = None;
        progress.error = None;
        drop(progress);
        self.mode.send_replace(mode);
    }
    fn applied(&self, mode: PresenceMode) {
        let mut progress = self.progress.lock().unwrap_or_else(|e| e.into_inner());
        progress.applied = Some(mode);
        progress.error = None;
    }
    pub fn alive(&self) -> bool {
        self.worker
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .is_some_and(|worker| !worker.is_finished())
    }
    pub fn connected(&self) -> bool {
        self.connections.load(Ordering::SeqCst) > 0
    }
    pub fn stop(&self) {
        self.shutdown.send_replace(true);
        if let Some(worker) = self.worker.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = worker.join();
        }
    }
}
pub fn check_local_dns() -> Result<(), String> {
    use std::net::ToSocketAddrs;
    let addresses: Vec<_> = (LOCAL_CHAT_DOMAIN, 443).to_socket_addrs()
        .map_err(|_| "Presence's local chat address could not resolve. Check DNS or see the presence setup guide.".to_string())?.collect();
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| address.ip() != std::net::IpAddr::V4(Ipv4Addr::LOCALHOST))
    {
        return Err("Presence's chat address must resolve only to 127.0.0.1. Check DNS before enabling presence controls.".into());
    }
    Ok(())
}
pub fn validate_identity(bytes: &[u8]) -> Result<Identity, String> {
    if bytes.len() > 512 * 1024 {
        return Err("Presence certificate is too large.".into());
    }
    let identity = Identity::from_pkcs12(bytes, "").map_err(|error| {
        format!(
            "Presence certificate could not be loaded: {error}. Prepare presence controls again."
        )
    })?;
    // Verify the cached identity's public chain, hostname and validity using the
    // platform's normal TLS verifier. No certificate trust is disabled or installed.
    let acceptor = TlsAcceptor::new(identity.clone())
        .map_err(|_| "Unable to prepare local presence TLS".to_string())?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let server = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
                    return acceptor.accept(stream).is_ok();
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(_) => return false,
            }
        }
    });
    let result: Result<(), String> = (|| {
        let stream = std::net::TcpStream::connect_timeout(&address, Duration::from_secs(5))
            .map_err(|_| "Unable to verify presence certificate locally".to_string())?;
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| e.to_string())?;
        let connector = TlsConnector::new()
            .map_err(|_| "Unable to create presence TLS verifier".to_string())?;
        connector.connect(LOCAL_CHAT_DOMAIN, stream).map_err(|_| "Presence certificate is expired, untrusted or for a different hostname. Prepare presence controls again.".to_string())?;
        Ok(())
    })();
    let accepted = server.join().unwrap_or(false);
    result?;
    if !accepted {
        return Err("Presence certificate handshake failed.".into());
    }
    Ok(identity)
}
pub fn start(identity: Identity, mode: PresenceMode) -> Result<Arc<Proxy>, String> {
    let config = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    let chat = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    config.set_nonblocking(true).map_err(|e| e.to_string())?;
    chat.set_nonblocking(true).map_err(|e| e.to_string())?;
    let (mode_tx, _) = watch::channel(mode);
    let (stop_tx, _) = watch::channel(false);
    let proxy = Arc::new(Proxy {
        mode: mode_tx,
        shutdown: stop_tx,
        endpoint: Mutex::new(None),
        progress: Mutex::new(Progress::default()),
        connections: AtomicUsize::new(0),
        config_port: config.local_addr().map_err(|e| e.to_string())?.port(),
        chat_port: chat.local_addr().map_err(|e| e.to_string())?.port(),
        worker: Mutex::new(None),
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?,
    });
    let state = proxy.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let worker = std::thread::Builder::new().name("laap-presence".into()).spawn(move || {
        let runtime = match tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build() {
            Ok(runtime) => runtime,
            Err(_) => { let _ = ready_tx.send(Err("Unable to start presence runtime".to_string())); return; }
        };
        runtime.block_on(async move {
            let result = (|| {
                let config = tokio::net::TcpListener::from_std(config).map_err(|e| e.to_string())?;
                let chat = tokio::net::TcpListener::from_std(chat).map_err(|e| e.to_string())?;
                let acceptor = tokio_native_tls::TlsAcceptor::from(TlsAcceptor::new(identity).map_err(|e| e.to_string())?);
                Ok::<_, String>((config, chat, acceptor))
            })();
            let (config, chat, acceptor) = match result { Ok(result) => result, Err(error) => { let _ = ready_tx.send(Err(error)); return; } };
            let app = Router::new().fallback(config_request).with_state(state.clone());
            let mut stop = state.shutdown.subscribe();
            let _ = ready_tx.send(Ok(()));
            tokio::select! {
                _ = async { let _ = axum::serve(config, app).await; } => state.error("Presence configuration listener stopped."),
                _ = serve_chat(chat, acceptor, state.clone()) => state.error("Presence chat listener stopped."),
                _ = stop.changed() => {},
            }
        });
        runtime.shutdown_timeout(Duration::from_secs(1));
    }).map_err(|e| e.to_string())?;
    *proxy.worker.lock().unwrap_or_else(|e| e.into_inner()) = Some(worker);
    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => Ok(proxy),
        _ => {
            proxy.stop();
            Err("Presence listeners did not start. Riot was not launched.".into())
        }
    }
}
fn response(status: StatusCode, content_type: &str, bytes: Vec<u8>) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(bytes))
        .unwrap_or_else(|_| Response::new(Body::from("Unable to build presence response")))
}
async fn bounded(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|size| size > LIMIT as u64)
    {
        return Err("Riot configuration response exceeded its size limit.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Unable to read Riot configuration response".to_string())?
    {
        if bytes.len() + chunk.len() > LIMIT {
            return Err("Riot configuration response exceeded its size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
fn trusted_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    !host.is_empty()
        && [".riotgames.com", ".riotgames.net", ".pvp.net"]
            .iter()
            .any(|suffix| host.ends_with(suffix))
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.')
}
fn rewrite_config(
    value: &mut serde_json::Value,
    affinity: Option<&str>,
    local_port: u16,
) -> Result<Option<Endpoint>, String> {
    let Some(port) = value.get("chat.port") else {
        if value.as_object().is_some_and(|object| {
            object
                .keys()
                .any(|key| key == "chat" || key.starts_with("chat."))
        }) {
            return Err("Riot's chat configuration changed. Disable presence controls for normal launch until this format is supported.".into());
        }
        return Ok(None);
    };
    let port = port
        .as_u64()
        .and_then(|p| u16::try_from(p).ok())
        .filter(|p| *p > 0)
        .ok_or("Riot provided an invalid chat port")?;
    let affinity_host =
        affinity.and_then(|affinity| value.get("chat.affinities")?.get(affinity)?.as_str());
    let host = affinity_host
        .or_else(|| value.get("chat.host").and_then(|v| v.as_str()))
        .ok_or("Riot did not provide a chat server")?;
    if !trusted_host(host) {
        return Err(
            "Riot provided an unrecognized chat hostname. Presence launch was not routed.".into(),
        );
    }
    let endpoint = Endpoint {
        host: host.to_string(),
        port,
    };
    let object = value
        .as_object_mut()
        .ok_or("Riot chat configuration is not an object")?;
    object.insert("chat.host".into(), serde_json::json!(LOCAL_CHAT_DOMAIN));
    object.insert("chat.port".into(), serde_json::json!(local_port));
    if let Some(affinities) = object
        .get_mut("chat.affinities")
        .and_then(|v| v.as_object_mut())
    {
        for host in affinities.values_mut() {
            *host = serde_json::json!(LOCAL_CHAT_DOMAIN);
        }
    }
    Ok(Some(endpoint))
}
async fn config_request(State(state): State<Arc<Proxy>>, request: Request) -> Response {
    if request.method() != Method::GET {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain",
            b"GET only".to_vec(),
        );
    }
    let (parts, _) = request.into_parts();
    let result = async {
        let path = parts
            .uri
            .path_and_query()
            .map(|p| p.as_str())
            .unwrap_or("/");
        let mut call = state.client.get(format!("{CONFIG_ORIGIN}{path}"));
        for name in ["user-agent", "authorization", "x-riot-entitlements-jwt"] {
            if let Some(value) = parts.headers.get(name) {
                call = call.header(name, value);
            }
        }
        let upstream = call
            .send()
            .await
            .map_err(|_| "Unable to reach Riot's client configuration service".to_string())?;
        let status = upstream.status();
        let content_type = upstream
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json")
            .to_owned();
        let bytes = bounded(upstream).await?;
        if !status.is_success() {
            state.error(&format!("Riot configuration returned HTTP {}. The client may retry; presence is not confirmed.", status.as_u16()));
            return Ok(response(status, &content_type, bytes));
        }
        let mut value: serde_json::Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => return Ok(response(status, &content_type, bytes)),
        };
        let mut affinity = None;
        if value
            .get("chat.affinity.enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            && value.get("chat.port").is_some()
        {
            if let Some(auth) = parts.headers.get(header::AUTHORIZATION) {
                let pas = state
                    .client
                    .get(AFFINITY_URL)
                    .header(header::AUTHORIZATION, auth)
                    .send()
                    .await;
                if let Ok(pas) = pas {
                    if pas.status().is_success() {
                        if let Ok(bytes) = bounded(pas).await {
                            if let Ok(jwt) = std::str::from_utf8(&bytes) {
                                if let Some(payload) = jwt.trim().split('.').nth(1) {
                                    if let Ok(payload) =
                                        URL_SAFE_NO_PAD.decode(payload.trim_end_matches('='))
                                    {
                                        if let Ok(json) =
                                            serde_json::from_slice::<serde_json::Value>(&payload)
                                        {
                                            affinity = json
                                                .get("affinity")
                                                .and_then(|v| v.as_str())
                                                .map(str::to_owned);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if let Some(endpoint) = rewrite_config(&mut value, affinity.as_deref(), state.chat_port)? {
            *state.endpoint.lock().unwrap_or_else(|e| e.into_inner()) = Some(endpoint);
            let mut progress = state.progress.lock().unwrap_or_else(|e| e.into_inner());
            progress.routed = true;
            progress.error = None;
        }
        Ok::<_, String>(response(
            status,
            &content_type,
            serde_json::to_vec(&value)
                .map_err(|_| "Unable to prepare Riot configuration response".to_string())?,
        ))
    }
    .await;
    match result {
        Ok(response) => response,
        Err(error) => {
            state.error(&error);
            response(
                StatusCode::BAD_GATEWAY,
                "text/plain",
                b"LAAP presence configuration is unavailable. Check LAAP for details.".to_vec(),
            )
        }
    }
}
async fn serve_chat(
    listener: tokio::net::TcpListener,
    acceptor: tokio_native_tls::TlsAcceptor,
    state: Arc<Proxy>,
) {
    let slots = Arc::new(tokio::sync::Semaphore::new(8));
    loop {
        let Ok((stream, peer)) = listener.accept().await else {
            return;
        };
        if !peer.ip().is_loopback() {
            continue;
        }
        let Ok(slot) = slots.clone().try_acquire_owned() else {
            continue;
        };
        let state = state.clone();
        let acceptor = acceptor.clone();
        tokio::spawn(async move {
            let _slot = slot;
            if let Err(error) = chat_connection(stream, acceptor, state.clone()).await {
                state.error(&error);
            }
        });
    }
}
struct Connected(Arc<Proxy>);
impl Drop for Connected {
    fn drop(&mut self) {
        if self.0.connections.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.0
                .progress
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .applied = None;
        }
    }
}
async fn chat_connection(
    stream: tokio::net::TcpStream,
    acceptor: tokio_native_tls::TlsAcceptor,
    state: Arc<Proxy>,
) -> Result<(), String> {
    let mut stopped = state.shutdown.subscribe();
    let incoming = tokio::time::timeout(Duration::from_secs(12), acceptor.accept(stream))
        .await
        .map_err(|_| "Riot chat TLS handshake timed out".to_string())?
        .map_err(|_| {
            "Riot rejected the local presence certificate. Prepare presence controls again."
                .to_string()
        })?;
    let endpoint = state
        .endpoint
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or("Presence has not received Riot's chat routing configuration")?;
    let outgoing = tokio::time::timeout(
        Duration::from_secs(12),
        tokio::net::TcpStream::connect((endpoint.host.as_str(), endpoint.port)),
    )
    .await
    .map_err(|_| "Riot chat connection timed out".to_string())?
    .map_err(|_| "Unable to connect to Riot chat".to_string())?;
    let connector = tokio_native_tls::TlsConnector::from(
        TlsConnector::new().map_err(|_| "Unable to prepare Riot chat TLS".to_string())?,
    );
    let outgoing = tokio::time::timeout(
        Duration::from_secs(12),
        connector.connect(&endpoint.host, outgoing),
    )
    .await
    .map_err(|_| "Riot chat TLS handshake timed out".to_string())?
    .map_err(|_| "Riot chat certificate validation failed".to_string())?;
    state.connections.fetch_add(1, Ordering::SeqCst);
    let _connected = Connected(state.clone());
    let (client_read, mut client_write) = tokio::io::split(incoming);
    let (mut server_read, server_write) = tokio::io::split(outgoing);
    let outbound = relay_presence(client_read, server_write, state.clone());
    tokio::select! {
        result = outbound => result,
        result = tokio::io::copy(&mut server_read, &mut client_write) => result.map(|_| ()).map_err(|_| "Riot chat connection closed unexpectedly".into()),
        _ = stopped.changed() => Ok(()),
    }
}
async fn relay_presence<R: tokio::io::AsyncRead + Unpin, W: tokio::io::AsyncWrite + Unpin>(
    mut reader: R,
    mut writer: W,
    state: Arc<Proxy>,
) -> Result<(), String> {
    let mut mode = state.mode.subscribe();
    let mut decoder = Frames::default();
    let mut original: Option<Vec<u8>> = None;
    let mut bytes = [0u8; 16 * 1024];
    loop {
        let pending_frame = decoder.pending();
        tokio::select! {
            changed = mode.changed() => {
                if changed.is_err() { return Ok(()); }
                if let Some(frame) = &original {
                    let selected = *mode.borrow_and_update();
                    let rewritten = presence_protocol::rewrite(frame, selected)?;
                    writer.write_all(&rewritten).await.map_err(|_| "Unable to apply the presence change to Riot chat".to_string())?;
                    writer.flush().await.map_err(|_| "Unable to flush the presence change".to_string())?;
                    state.applied(selected);
                }
            }
            read = async {
                if pending_frame {
                    tokio::time::timeout(Duration::from_secs(15), reader.read(&mut bytes)).await
                        .map_err(|_| "An incomplete chat stanza timed out. Presence is unconfirmed.".to_string())?
                        .map_err(|_| "Unable to read Riot's local chat stream".to_string())
                } else { reader.read(&mut bytes).await.map_err(|_| "Unable to read Riot's local chat stream".to_string()) }
            } => {
                let count = read?;
                if count == 0 { return if decoder.pending() { Err("Riot closed a partial chat stanza. Presence is unconfirmed.".into()) } else { Ok(()) }; }
                decoder.push(&bytes[..count])?;
                while let Some(frame) = decoder.next()? {
                    let global = presence_protocol::global_presence(&frame)?;
                    let selected = *mode.borrow();
                    let forwarded = if global { presence_protocol::rewrite(&frame, selected)? } else { frame.clone() };
                    writer.write_all(&forwarded).await.map_err(|_| "Unable to forward Riot chat".to_string())?;
                    writer.flush().await.map_err(|_| "Unable to flush Riot chat".to_string())?;
                    if global { original = Some(frame); state.applied(selected); }
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn live_mode_changes_replay_presence_without_restarting_the_stream() {
        let (mode, _) = watch::channel(PresenceMode::Offline);
        let (shutdown, _) = watch::channel(false);
        let state = Arc::new(Proxy {
            mode,
            shutdown,
            endpoint: Mutex::new(None),
            progress: Mutex::new(Progress::default()),
            connections: AtomicUsize::new(1),
            config_port: 0,
            chat_port: 0,
            worker: Mutex::new(None),
            client: reqwest::Client::new(),
        });
        let (mut client, reader) = tokio::io::duplex(16384);
        let (writer, mut upstream) = tokio::io::duplex(16384);
        let task = tokio::spawn(relay_presence(reader, writer, state.clone()));
        let original = b"<presence><show>chat</show><games><league_of_legends>live</league_of_legends></games></presence>";
        client.write_all(&original[..15]).await.unwrap();
        let mut early = [0u8; 1];
        assert!(
            tokio::time::timeout(Duration::from_millis(40), upstream.read_exact(&mut early))
                .await
                .is_err()
        );
        client.write_all(&original[15..]).await.unwrap();
        let expected = presence_protocol::rewrite(original, PresenceMode::Offline).unwrap();
        let mut filtered = vec![0; expected.len()];
        tokio::time::timeout(Duration::from_secs(3), upstream.read_exact(&mut filtered))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(filtered, expected);
        state.change_mode(PresenceMode::Online);
        let mut restored = vec![0; original.len()];
        tokio::time::timeout(Duration::from_secs(3), upstream.read_exact(&mut restored))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(restored, original);
        assert_eq!(state.progress().applied, Some(PresenceMode::Online));
        state.change_mode(PresenceMode::Offline);
        tokio::time::timeout(Duration::from_secs(3), upstream.read_exact(&mut filtered))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(filtered, expected);
        drop(client);
        task.await.unwrap().unwrap();
    }
    #[test]
    fn routing_preserves_the_selected_riot_region_and_blocks_other_hosts() {
        let mut config = serde_json::json!({"chat.host":"chat.na1.lol.riotgames.com","chat.port":5223,"chat.affinities":{"eu":"chat.euw1.lol.riotgames.com","na":"chat.na1.lol.riotgames.com"},"unrelated":true});
        let endpoint = rewrite_config(&mut config, Some("eu"), 54321)
            .unwrap()
            .unwrap();
        assert_eq!(endpoint.host, "chat.euw1.lol.riotgames.com");
        assert_eq!(endpoint.port, 5223);
        assert_eq!(config["chat.port"], 54321);
        assert_eq!(config["chat.host"], LOCAL_CHAT_DOMAIN);
        assert_eq!(config["chat.affinities"]["na"], LOCAL_CHAT_DOMAIN);
        assert_eq!(config["unrelated"], true);
        let mut malicious =
            serde_json::json!({"chat.host":"chat.riotgames.com.attacker.test","chat.port":443});
        assert!(rewrite_config(&mut malicious, None, 54321).is_err());
    }
    #[test]
    fn configuration_without_chat_is_not_rerouted() {
        let mut value = serde_json::json!({"feature":true});
        assert!(rewrite_config(&mut value, None, 54321).unwrap().is_none());
        assert_eq!(value, serde_json::json!({"feature":true}));
        assert!(validate_identity(b"invalid pfx").is_err());
    }
}
