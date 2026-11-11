use serde::{Deserialize, Serialize};
use sha2::{Digest,Sha256};
use tauri::AppHandle;
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct CommunityCredential { pub id:String, pub auth_token:String }
fn validate_origin(origin:&str)->Result<(),String> {
    let u=reqwest::Url::parse(origin).map_err(|_|"Invalid service origin")?;
    if !u.username().is_empty() || u.password().is_some() || u.query().is_some() || u.fragment().is_some() || u.path()!="/" ||
        !(u.scheme()=="https" || (u.scheme()=="http" && matches!(u.host_str(),Some("localhost"|"127.0.0.1"|"[::1]")))) { return Err("HTTPS service origin required (loopback development excepted).".into()); } Ok(())
}
fn entry(app:&AppHandle,origin:&str)->Result<keyring::Entry,String> {
    validate_origin(origin)?;
    let account=format!("marketplace-{:x}",Sha256::digest(origin.as_bytes()));
    keyring::Entry::new(&format!("{}.community",app.config().identifier),&account).map_err(|_|"OS credential store unavailable".into())
}
#[tauri::command]
pub fn community_credential_load(app:AppHandle,origin:String)->Result<Option<CommunityCredential>,String> {
    match entry(&app,&origin)?.get_password() {
        Ok(s)=>serde_json::from_str(&s).map(Some).map_err(|_|"Stored credential is invalid; recover or disconnect.".into()),
        Err(keyring::Error::NoEntry)=>Ok(None), Err(_)=>Err("OS credential store unavailable".into())
    }
}
#[tauri::command]
pub fn community_credential_save(app:AppHandle,origin:String,credential:CommunityCredential)->Result<(),String> {
    if credential.id.len()>64 || credential.id.is_empty() || credential.auth_token.len()!=64 || !credential.auth_token.bytes().all(|b|b.is_ascii_hexdigit()) {return Err("Invalid creator credential".into());}
    entry(&app,&origin)?.set_password(&serde_json::to_string(&credential).map_err(|e|e.to_string())?).map_err(|_|"Could not save to OS credential store".into())
}
#[tauri::command]
pub fn community_credential_clear(app:AppHandle,origin:String)->Result<(),String> {
    match entry(&app,&origin)?.delete_credential() { Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("Could not clear OS credential".into()) }
}
#[cfg(test)] mod tests {use super::*; #[test] fn credentials_are_scoped_to_secure_origins(){assert!(validate_origin("https://community.example").is_ok());assert!(validate_origin("http://127.0.0.1:4171").is_ok());for u in ["http://example.org","https://a@host","https://host/path","file:///vault","https://host?key=secret"]{assert!(validate_origin(u).is_err());}}}
