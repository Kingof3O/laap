#[cfg(not(feature = "studio"))]
pub mod local_accounts;
#[cfg(not(feature = "studio"))]
pub mod session;
pub mod updater;
pub mod window;

#[cfg(not(feature = "studio"))]
pub use session::launch_riot_client;

#[cfg(all(test, not(feature = "studio")))]
mod tests {
    use super::session::LEAGUE_LAUNCH_ARGS;

    #[test]
    fn launch_arguments_are_normal_league_arguments_without_secrets() {
        assert_eq!(
            LEAGUE_LAUNCH_ARGS,
            [
                "--launch-product=league_of_legends",
                "--launch-patchline=live"
            ]
        );
        assert!(LEAGUE_LAUNCH_ARGS
            .iter()
            .all(|argument| !argument.contains("password") && !argument.contains("token")));
    }
}
