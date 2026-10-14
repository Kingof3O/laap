# SignPath onboarding and Windows signing

Status: application preparation. SignPath approval, organization credentials, and the trusted-build integration are not available yet. The workflow supports an unsigned preflight now and production signing after enrollment; it does not invent a signing identity.

## Public policy and eligibility

The repository homepage and release downloads link to [Code signing policy](../../CODE_SIGNING.md) and [Privacy policy](../../PRIVACY.md). Hussien Salah (Kingof3O) is the sole confirmed author, reviewer, and release approver. GitHub 2FA is enabled; the SignPath account must enable MFA as well.

The application should accurately disclose: the project's early public adoption, Riot session-file provisioning/switching, optional local League Client TLS exception, presence proxy, bundled Riot artwork, platform WebView2, and third-party certificate/DNS connections. A public MIT repository does not automatically meet all Foundation requirements. No signing attribution is presented as active before acceptance.

## Preflight

Run **Build and sign Windows with SignPath** with `sign=false`. The workflow builds both editions' application binaries, bundles them using `tauri bundle` without recompiling, checks version metadata, then extracts every EXE/MSI and verifies its application hash against the input binary. It uploads clearly named unsigned application/installer samples for the Foundation to review. No request is sent to SignPath and no release is published.

The input ZIP layouts match these versioned configurations:

- `.signpath/laap-windows-applications-v1.xml`: only `team/laap-desktop-core.exe` and `offline/laap-desktop-core.exe`, with fixed product names and version parameters.
- `.signpath/laap-windows-installers-v1.xml`: only the four canonical LAAP EXE/MSI names. The applications inside them are already signed in the first stage; packaging must preserve their bytes.

NSIS is not a deep-signable format in the documented SignPath artifact schema. The workflow signs its application before packaging and its EXE wrapper afterward. NSIS-generated uninstaller code is not separately signed by this flow; disclose that when agreeing the artifact configuration. MSI wrappers are signed in the second stage too. Microsoft/other third-party runtime files must not be signed with LAAP's Foundation access.

## Activate only after approval

1. Complete SignPath's account/MFA setup and review the Foundation's actual enrollment instructions.
2. Connect the Foundation-approved SignPath GitHub application to this repository using its required, narrowly scoped permissions. This is a new security-sensitive grant and must be approved by the repository owner.
3. Configure SignPath's trusted build link for `Kingof3O/laap` and GitHub-hosted runners. Import the two XML configurations with the matching slugs shown above. Restrict production approval to Hussien Salah; CI can submit but cannot approve requests.
4. Add GitHub repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, and `SIGNPATH_SIGNING_POLICY_SLUG` using the actual values SignPath supplies. Add a narrowly scoped CI token as the GitHub Actions secret `SIGNPATH_API_TOKEN`; never send the token in chat or commit it.
5. Run the workflow from `main` or an existing version tag with `sign=true`, and approve the application and installer requests in SignPath. The action is pinned to the official v3 commit. Missing configuration, invalid signatures, an unexpected publisher, missing timestamps, changed bundled application bytes, or a signing failure stops the job without an unsigned fallback.
6. After a successful production signing run, set the repository variable `SIGNPATH_ENABLED=true`. Subsequent version-tag release runs delegate Windows artifacts to SignPath; macOS retains its existing build flow. The release remains a draft until all required builds and Windows signature verification pass. Version tags must point to reviewed commits on `main`; signing private keys stay with SignPath.

Unsigned releases retain the existing flow until `SIGNPATH_ENABLED` is enabled. Signed artifact names are `LAAP-Desktop-<version>-x64-setup.exe`, `LAAP-Desktop-<version>-x64.msi`, and the equivalent Offline names. The manifest records SHA-256 values and whether signatures were required. The Signature status, Foundation publisher, and timestamp are checked on the returned files and the extracted LAAP applications before upload to a draft release.

## What is not yet verified

Unsigned packaging preflight can be verified before enrollment. The actual Foundation signature and approval path cannot be exercised without an accepted account and token. A valid signature does not promise immediate Microsoft SmartScreen reputation, and signing is not a Riot endorsement.

References: [Foundation requirements](https://signpath.org/terms.html), [official GitHub integration](https://docs.signpath.io/trusted-build-systems/github), [artifact configuration](https://docs.signpath.io/artifact-configuration/syntax).
