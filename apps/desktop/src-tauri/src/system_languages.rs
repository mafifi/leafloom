const MAX_LANGUAGES: usize = 64;
const MAX_ENV_BYTES: usize = 4096;

fn normalize(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 128 {
        return None;
    }
    let (base, modifier) = raw
        .split_once('@')
        .map_or((raw, None), |(b, m)| (b, Some(m)));
    if modifier.is_some_and(|m| {
        m.is_empty() || m.len() > 32 || !m.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    }) {
        return None;
    }
    let (code, encoding) = base
        .split_once('.')
        .map_or((base, None), |(b, e)| (b, Some(e)));
    if encoding.is_some_and(|e| {
        e.is_empty() || e.len() > 32 || !e.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    }) {
        return None;
    }
    if code.eq_ignore_ascii_case("C") || code.eq_ignore_ascii_case("POSIX") {
        return None;
    }
    let code = code.replace('_', "-");
    let mut parts = code.split('-');
    let first = parts.next()?;
    if !(2..=3).contains(&first.len()) || !first.bytes().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let mut result = first.to_ascii_lowercase();
    for part in parts {
        if !(2..=8).contains(&part.len()) || !part.bytes().all(|c| c.is_ascii_alphanumeric()) {
            return None;
        }
        let part = if part.len() == 2 && part.bytes().all(|c| c.is_ascii_alphabetic()) {
            part.to_ascii_uppercase()
        } else if part.len() == 4 && part.bytes().all(|c| c.is_ascii_alphabetic()) {
            format!(
                "{}{}",
                part[..1].to_ascii_uppercase(),
                part[1..].to_ascii_lowercase()
            )
        } else {
            part.to_ascii_lowercase()
        };
        result.push('-');
        result.push_str(&part);
    }
    Some(result)
}
fn preferences<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut result = Vec::new();
    for raw in values {
        if let Some(code) = normalize(raw) {
            if !result
                .iter()
                .any(|v: &String| v.eq_ignore_ascii_case(&code))
            {
                result.push(code);
            }
            if result.len() == MAX_LANGUAGES {
                break;
            }
        }
    }
    if result.is_empty() {
        result.push("en".into());
    }
    result
}

/// LANGUAGE lists first, then LC_ALL, LC_MESSAGES and LANG fallbacks.
/// This supplies OS defaults only; the saved explicit application choice wins.
pub fn environment_languages(values: &[Option<String>; 4]) -> Vec<String> {
    preferences(values.iter().enumerate().flat_map(|(i, value)| {
        value
            .as_deref()
            .filter(|v| v.len() <= MAX_ENV_BYTES)
            .into_iter()
            .flat_map(move |v| {
                if i == 0 {
                    v.split(':').collect::<Vec<_>>()
                } else {
                    vec![v]
                }
            })
    }))
}

#[cfg(any(target_os = "windows", test))]
fn windows_languages(buffer: &[u16], count: usize) -> Vec<String> {
    if count == 0 || count > MAX_LANGUAGES || buffer.len() > 65_536 || !buffer.ends_with(&[0, 0]) {
        return vec!["en".into()];
    }
    let mut values = Vec::new();
    for part in buffer.split(|v| *v == 0).take_while(|v| !v.is_empty()) {
        let Ok(value) = String::from_utf16(part) else {
            return vec!["en".into()];
        };
        values.push(value);
    }
    if values.len() != count {
        return vec!["en".into()];
    }
    preferences(values.iter().map(String::as_str))
}

#[cfg(target_os = "windows")]
pub fn preferred_languages() -> Vec<String> {
    use windows_sys::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
    let mut count = 0;
    let mut length = 0;
    // The first call queries UTF-16 capacity, including the double null terminator.
    if unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            std::ptr::null_mut(),
            &mut length,
        )
    } == 0
        || length < 2
        || length > 65_536
        || count == 0
        || count > MAX_LANGUAGES as u32
    {
        return vec!["en".into()];
    }
    let mut buffer = vec![0u16; length as usize];
    let capacity = length;
    if unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            buffer.as_mut_ptr(),
            &mut length,
        )
    } == 0
        || length > capacity
        || length < 2
    {
        return vec!["en".into()];
    }
    windows_languages(&buffer[..length as usize], count as usize)
}
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
pub fn preferred_languages() -> Vec<String> {
    environment_languages(
        &["LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"].map(|key| std::env::var(key).ok()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn values(v: [Option<&str>; 4]) -> [Option<String>; 4] {
        v.map(|s| s.map(str::to_owned))
    }
    #[test]
    fn windows_multistring_preserves_order_and_rejects_invalid_buffers() {
        let buffer = "fr-CA\0de-DE\0FR-ca\0\0".encode_utf16().collect::<Vec<_>>();
        assert_eq!(windows_languages(&buffer, 3), vec!["fr-CA", "de-DE"]);
        assert_eq!(windows_languages(&buffer, 2), vec!["en"]);
        assert_eq!(windows_languages(&[0xd800, 0, 0], 1), vec!["en"]);
        assert_eq!(windows_languages(&[102, 114, 0], 1), vec!["en"]);
        assert_eq!(windows_languages(&buffer, 65), vec!["en"]);
    }
    #[test]
    fn ordered_preferences_normalize_and_deduplicate() {
        assert_eq!(
            environment_languages(&values([
                Some("fr_CA.UTF-8:de_DE:fr-ca:zh_Hant_TW"),
                Some("it_IT.UTF-8"),
                Some("pt_BR@latin"),
                Some("en_US.UTF-8")
            ])),
            vec!["fr-CA", "de-DE", "zh-Hant-TW", "it-IT", "pt-BR", "en-US"]
        );
    }
    #[test]
    fn c_posix_invalid_and_missing_preferences_fall_back() {
        for v in [
            [None, None, None, None],
            [Some("C:POSIX:C.UTF-8"), Some("C"), Some("POSIX"), None],
            [
                Some("../../fr:en--US:english:<script>:fr@bad!"),
                None,
                None,
                None,
            ],
        ] {
            assert_eq!(environment_languages(&values(v)), vec!["en"]);
        }
    }
    #[test]
    fn output_is_bounded_without_reading_process_environment() {
        let language = (0..100)
            .map(|i| format!("en-{i:03}"))
            .collect::<Vec<_>>()
            .join(":");
        let result = environment_languages(&[Some(language), None, None, None]);
        assert_eq!(result.len(), 64);
        assert_eq!(result[0], "en-000");
        assert_eq!(result[63], "en-063");
    }
}
