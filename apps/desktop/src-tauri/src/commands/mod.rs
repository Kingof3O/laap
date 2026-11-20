pub mod local_accounts;
pub mod session;
pub mod system_utils;
pub mod updater;
pub mod window;

pub use session::launch_riot_client;

#[cfg(test)]
mod tests {
    use super::session::{launch_args, LEAGUE_LAUNCH_ARGS};
    use crate::local_store::Game;

    #[test]
    fn launch_arguments_are_normal_league_arguments_without_secrets() {
        assert_eq!(
            LEAGUE_LAUNCH_ARGS,
            [
                "--launch-product=league_of_legends",
                "--launch-patchline=live"
            ]
        );
        assert_eq!(launch_args(Game::League), LEAGUE_LAUNCH_ARGS);
        assert!(LEAGUE_LAUNCH_ARGS
            .iter()
            .all(|argument| !argument.contains("password") && !argument.contains("token")));
    }

    #[test]
    fn launch_arguments_for_valorant_are_official_args_without_secrets() {
        assert_eq!(
            launch_args(Game::Valorant),
            [
                "--launch-product=valorant",
                "--launch-patchline=live"
            ]
        );
        assert!(launch_args(Game::Valorant)
            .iter()
            .all(|argument| !argument.contains("password") && !argument.contains("token")));
    }
}
