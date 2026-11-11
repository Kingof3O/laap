use serde::Serialize;

#[cfg(all(feature = "basic", feature = "studio"))]
compile_error!("Select exactly one LAAP product configuration");

#[cfg(feature = "basic")]
const PRODUCT: (&str, &str, &str) = ("basic", "com.laap.offline", "offline");
#[cfg(feature = "studio")]
const PRODUCT: (&str, &str, &str) = ("studio", "com.laap.studio", "studio");
#[cfg(not(any(feature = "basic", feature = "studio")))]
const PRODUCT: (&str, &str, &str) = ("complete", "com.laaP.desktop", "team");

pub fn validate_identifier(identifier: &str) -> Result<(), std::io::Error> {
    if PRODUCT.1 != identifier {
        return Err(std::io::Error::other(format!(
            "LAAP {} cannot run with app identifier {identifier}",
            PRODUCT.0
        )));
    }
    Ok(())
}

pub fn update_channel() -> &'static str {
    PRODUCT.2
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCapabilities {
    flavor: &'static str,
    accounts: bool,
    customization: bool,
    account_presets: bool,
}

#[tauri::command]
pub fn get_product_capabilities() -> ProductCapabilities {
    ProductCapabilities {
        flavor: PRODUCT.0,
        accounts: !cfg!(feature = "studio"),
        customization: !cfg!(feature = "basic"),
        account_presets: !cfg!(any(feature = "studio", feature = "basic")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_capabilities_match_identity_and_update_channel() {
        let caps = get_product_capabilities();
        assert!(validate_identifier(PRODUCT.1).is_ok());
        assert!(validate_identifier("com.laap.unknown").is_err());
        match caps.flavor {
            "basic" => assert!(caps.accounts && !caps.customization && !caps.account_presets),
            "studio" => assert!(!caps.accounts && caps.customization && !caps.account_presets),
            "complete" => assert!(caps.accounts && caps.customization && caps.account_presets),
            _ => unreachable!(),
        }
        assert_eq!(update_channel(), PRODUCT.2);
    }

    #[test]
    fn permission_boundaries_enforced() {
        let caps = get_product_capabilities();
        #[cfg(feature = "basic")]
        {
            assert_eq!(caps.flavor, "basic");
            assert!(caps.accounts);
            assert!(!caps.customization);
            assert!(!caps.account_presets);
            assert_eq!(PRODUCT.1, "com.laap.offline");
            assert_eq!(PRODUCT.2, "offline");
        }
        #[cfg(feature = "studio")]
        {
            assert_eq!(caps.flavor, "studio");
            assert!(!caps.accounts);
            assert!(caps.customization);
            assert!(!caps.account_presets);
            assert_eq!(PRODUCT.1, "com.laap.studio");
            assert_eq!(PRODUCT.2, "studio");
        }
        #[cfg(not(any(feature = "basic", feature = "studio")))]
        {
            assert_eq!(caps.flavor, "complete");
            assert!(caps.accounts);
            assert!(caps.customization);
            assert!(caps.account_presets);
            assert_eq!(PRODUCT.1, "com.laaP.desktop");
            assert_eq!(PRODUCT.2, "team");
        }
    }
}
