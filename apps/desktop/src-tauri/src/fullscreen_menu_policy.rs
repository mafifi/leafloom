/// NEO 1.3.5 main.js:1400: native bars return after any fullscreen exit,
/// including window-manager transitions; Alt reveals a fullscreen bar.
pub fn visibility(platform: &str, fullscreen: bool, reveal: bool) -> Option<bool> {
    match platform {
        "windows" | "linux" => Some(!fullscreen || reveal),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn window_manager_fullscreen_alt_choice_and_exit_restore_the_native_bar() {
        for platform in ["windows", "linux"] {
            let changes = [
                (false, false),
                (true, false),
                (true, true),
                (true, false),
                (false, false),
            ];
            assert_eq!(
                changes.map(|(full, reveal)| visibility(platform, full, reveal)),
                [Some(true), Some(false), Some(true), Some(false), Some(true)]
            );
        }
    }
    #[test]
    fn macos_global_menu_and_unknown_platforms_are_untouched() {
        for platform in ["macos", "unknown"] {
            for full in [false, true] {
                for reveal in [false, true] {
                    assert_eq!(visibility(platform, full, reveal), None);
                }
            }
        }
    }
}
