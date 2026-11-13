//! Champion → mod resolution scoring.
//!
//! Determines the best enabled local package for a detected champion using
//! champion-id targeting first, then normalized display-name/mod-id matching.
//! Pure functions: no I/O, fully unit-testable.

use super::library::InstalledMod;

/// Minimum confidence required before a package is considered a match.
pub const MIN_CONFIDENCE: f32 = 0.5;

#[derive(Clone, Debug, PartialEq)]
pub struct ModMatch {
    pub sha256: String,
    pub display_name: String,
    pub champion_id: u32,
    pub confidence: f32,
    pub reason: String,
}

/// Lowercase and strip separators/punctuation used across champion spellings.
pub fn normalize_champion_name(name: &str) -> String {
    name.to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

/// Score how well a package targets a champion. `0.0` means no match.
pub fn score_mod_for_champion(
    mod_name: &str,
    mod_id: &str,
    champion_ids: &[u32],
    champion_id: u32,
    champion_name: &str,
) -> f32 {
    if champion_ids.contains(&champion_id) {
        return 0.99;
    }

    let normalized_champion = normalize_champion_name(champion_name);
    if normalized_champion.is_empty() {
        return 0.0;
    }

    let name = normalize_champion_name(mod_name);
    let id = normalize_champion_name(mod_id);

    let name_hit = name.contains(&normalized_champion);
    let id_hit = id.contains(&normalized_champion);

    if name_hit && id_hit {
        return 0.9;
    }
    if name_hit {
        // Prefer exact/short names over incidental substrings in long titles.
        let ratio = normalized_champion.len() as f32 / name.chars().count().max(1) as f32;
        return 0.68 + ratio.clamp(0.0, 1.0) * 0.2;
    }
    if id_hit {
        return 0.62;
    }
    0.0
}

/// Pick the best enabled package for a champion. Ties break on priority.
pub fn resolve_best_mod(
    items: &[InstalledMod],
    champion_id: u32,
    champion_name: &str,
) -> Option<ModMatch> {
    items
        .iter()
        .filter(|item| item.enabled && !item.manifest.mod_id.starts_with("official_"))
        .filter_map(|item| {
            let confidence = score_mod_for_champion(
                &item.manifest.display_name,
                &item.manifest.mod_id,
                &item.manifest.champion_ids,
                champion_id,
                champion_name,
            );
            (confidence >= MIN_CONFIDENCE).then(|| {
                let reason = if item.manifest.champion_ids.contains(&champion_id) {
                    "champion-id".to_string()
                } else {
                    "name-match".to_string()
                };
                (item, confidence, reason)
            })
        })
        .max_by(|(a, ac, _), (b, bc, _)| {
            ac.partial_cmp(bc)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.priority.cmp(&b.priority))
        })
        .map(|(item, confidence, reason)| ModMatch {
            sha256: item.manifest.sha256.clone(),
            display_name: item.manifest.display_name.clone(),
            champion_id,
            confidence,
            reason,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::customization::library::{Entry, Manifest};

    fn item(sha_char: char, name: &str, champion_ids: Vec<u32>, priority: u32) -> InstalledMod {
        InstalledMod {
            manifest: Manifest {
                schema_version: 1,
                mod_id: format!("mod.{sha_char}"),
                version: "1.0.0".into(),
                display_name: name.into(),
                author: "Tester".into(),
                license: "CC0-1.0".into(),
                right_to_distribute: true,
                contains_paid_riot_content: false,
                sha256: sha_char.to_string().repeat(64),
                supported_game_builds: vec![],
                champion_ids,
                files: vec![Entry {
                    relative_path: "assets/a.png".into(),
                    sha256: "a".repeat(64),
                    size_bytes: 1,
                }],
                attribution_url: None,
                notes: None,
            },
            archive_bytes: 10,
            enabled: true,
            priority,
            format: "Fantome".into(),
        }
    }

    #[test]
    fn champion_id_targeting_beats_name_only_match() {
        let by_id = item('1', "Some Skin", vec![103], 0);
        let by_name = item('2', "Ahri Deluxe", vec![], 9);
        let picked = resolve_best_mod(&[by_id, by_name], 103, "Ahri").unwrap();
        assert_eq!(picked.sha256, "1".repeat(64));
        assert_eq!(picked.reason, "champion-id");
    }

    #[test]
    fn higher_priority_wins_between_name_matches() {
        let low = item('3', "Ahri Blue", vec![], 1);
        let high = item('4', "Ahri Red", vec![], 5);
        let picked = resolve_best_mod(&[low, high], 103, "Ahri").unwrap();
        assert_eq!(picked.sha256, "4".repeat(64));
    }

    #[test]
    fn unrelated_mods_are_not_selected() {
        assert!(resolve_best_mod(&[item('5', "Unrelated", vec![], 0)], 103, "Ahri").is_none());
    }

    #[test]
    fn normalization_handles_spaces_apostrophes_and_case() {
        assert_eq!(normalize_champion_name("Kai'Sa"), "kaisa");
        assert_eq!(normalize_champion_name("Miss Fortune"), "missfortune");
        assert!(score_mod_for_champion("Kaisa Custom", "x", &[], 145, "Kai'Sa") > 0.5);
    }

    #[test]
    fn disabled_mods_are_ignored() {
        let mut disabled = item('6', "Ahri Deluxe", vec![103], 100);
        disabled.enabled = false;
        assert!(resolve_best_mod(&[disabled], 103, "Ahri").is_none());
    }
}
