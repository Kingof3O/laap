use serde::Serialize;

const PRODUCT: (&str, &str, &str) = ("basic", "com.laap.offline", "offline");

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

/// Returns the active bundle identifier used for single-instance identity and Windows AUMID grouping.
pub fn app_identifier() -> &'static str {
    PRODUCT.1
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
        accounts: true,
        customization: false,
        account_presets: false,
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
        assert_eq!(caps.flavor, "basic");
        assert!(caps.accounts && !caps.customization && !caps.account_presets);
        assert_eq!(update_channel(), PRODUCT.2);
        assert_eq!(app_identifier(), PRODUCT.1);
    }
}
