use std::{collections::HashMap, sync::Mutex};
const SERVICE: &str = "org.mafifi.leafloom.cover-art";
pub struct Secrets { fixture: bool, values: Mutex<HashMap<String, String>>, access: Mutex<()> }
impl Secrets {
    pub fn new(fixture: bool) -> Self { Self { fixture, values: Mutex::new(HashMap::new()), access: Mutex::new(()) } }
    pub fn storage(&self) -> &'static str { if self.fixture { "fixture" } else if cfg!(target_os="macos") { "keychain" } else if cfg!(target_os="windows") { "credential-manager" } else { "secret-service" } }
    fn entry(&self, provider: &str) -> Result<keyring::Entry, String> { if provider != "openai" { return Err("INVALID".into()); } keyring::Entry::new(SERVICE, provider).map_err(|_| "SECRET_UNAVAILABLE".into()) }
    pub fn get(&self, provider: &str) -> Result<Option<String>, String> {
        if provider != "openai" { return Err("INVALID".into()); }
        if self.fixture { return Ok(self.values.lock().map_err(|_| "SECRET_UNAVAILABLE")?.get(provider).cloned()); }
        let _guard = self.access.lock().map_err(|_| "SECRET_UNAVAILABLE")?;
        match self.entry(provider)?.get_password() { Ok(value) => Ok(Some(value)), Err(keyring::Error::NoEntry) => Ok(None), Err(_) => Err("SECRET_UNAVAILABLE".into()) }
    }
    pub fn set(&self, provider: &str, value: Option<&str>) -> Result<(), String> {
        if provider != "openai" || value.is_some_and(|value| value.len() > 4096 || value.contains(['\r','\n'])) { return Err("INVALID".into()); }
        let value = value.filter(|value| !value.trim().is_empty());
        if self.fixture { let mut values = self.values.lock().map_err(|_| "SECRET_UNAVAILABLE")?; if let Some(value) = value { values.insert(provider.into(), value.into()); } else { values.remove(provider); } return Ok(()); }
        let _guard = self.access.lock().map_err(|_| "SECRET_UNAVAILABLE")?;
        let entry = self.entry(provider)?;
        if let Some(value) = value { entry.set_password(value).map_err(|_| "SECRET_UNAVAILABLE".into()) }
        else { match entry.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(_) => Err("SECRET_UNAVAILABLE".into()) } }
    }
}
#[cfg(test)] mod tests { use super::*; #[test] fn fixture_secrets_never_call_native_store_or_escape_scope() { let store = Secrets::new(true); assert_eq!(store.storage(),"fixture"); assert!(store.get("openai").unwrap().is_none()); store.set("openai",Some("synthetic-fixture-key")).unwrap(); assert_eq!(store.get("openai").unwrap().unwrap(),"synthetic-fixture-key"); assert!(store.set("foreign-service",Some("value")).is_err()); store.set("openai",None).unwrap(); assert!(store.get("openai").unwrap().is_none()); } }
