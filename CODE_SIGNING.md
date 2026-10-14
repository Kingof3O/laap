# Code signing policy

## Current status

LAAP is preparing an application for the free SignPath Foundation open-source signing program. Acceptance, a certificate, and production signing access have not been granted. Existing GitHub releases are unsigned; this policy does not claim that their SmartScreen warnings have been removed.

If the application is approved, attribution for signed Windows releases will be: **Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org)**. Microsoft Store distribution is not used.

## Project and responsibilities

LAAP's own source code is licensed under the [MIT License](LICENSE). The source repository is [Kingof3O/laap](https://github.com/Kingof3O/laap); Windows downloads remain on its [GitHub Releases page](https://github.com/Kingof3O/laap/releases).

| Role | Responsible maintainer |
| --- | --- |
| Author / committer | Hussien Salah ([Kingof3O](https://github.com/Kingof3O)) |
| Reviewer | Hussien Salah ([Kingof3O](https://github.com/Kingof3O)) |
| Signing request / release approver | Hussien Salah ([Kingof3O](https://github.com/Kingof3O)) |

The maintainer has confirmed GitHub two-factor authentication is enabled. SignPath accounts must also use multi-factor authentication. Contributions and changes to build/signing workflows require maintainer review. Each production signing request requires manual maintainer approval in SignPath; CI credentials may submit requests but must not approve them.

## Signing scope and build origin

Only LAAP application binaries and LAAP-generated EXE/MSI installers built from this public repository by GitHub-hosted Actions runners are eligible. The workflow prepares the format-specific NSS/MSI marker that Tauri normally patches into its app, signs each format-specific application, inserts it at the Tauri signing hook after that patch, and signs the installer wrappers afterward. It verifies the returned signatures, timestamps, product metadata, and the bundled application bytes before describing output as signed. It does not sign Riot Client, League of Legends, Microsoft WebView2 redistributables, or arbitrary user-provided files.

SignPath holds the signing key. No certificate private key belongs in the repository or the application. The CI API token is stored only in GitHub Actions secrets. Approval is required for each signing stage. Returned artifacts remain GitHub Actions artifacts until the maintainer approves their release; the onboarding workflow never publishes a release automatically.

## Privacy and third-party components

See the [Privacy policy](PRIVACY.md) for local Riot sessions, optional icon/rank sync, LAAP Team services, updates, and presence networking. The installed app does not send user data to SignPath. Signing submits only compiled LAAP artifacts and public build/repository metadata.

Riot rank-crest images are bundled with the desktop app; downloaded summoner icons are Riot artwork. These assets are not claimed to be covered by LAAP's MIT license. Microsoft WebView2 is a platform runtime. The presence compatibility certificate is maintained by a separate project. These components, session-file orchestration, the local LCU TLS exception, and the presence proxy must be disclosed to SignPath for eligibility review. Approval must not be assumed from the MIT license alone.

## Release and revocation

The approver checks the tagged source, successful build checks, signing request contents, and artifact hashes before approving a production request. A signature is not a Riot endorsement or a guarantee of SmartScreen reputation. If a build, token, or signing authorization is compromised, the maintainer will stop releases, revoke the CI token, and notify SignPath. SignPath Foundation can suspend signing or revoke its certificate under its [terms](https://signpath.org/terms.html).
