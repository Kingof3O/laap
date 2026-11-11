# Complete Parity Tracking Summary

The exact source-derived matrix (`FEATURE_PARITY_MATRIX.csv`) includes **131 rows**, comprising **95 user-dossier IPC commands** plus **36 Rose, public Wildflover and LAAP-specific feature requirements**. Each row has implementation policy, source, target phase, owner spec and acceptance test.

## Gaps that change project planning

1. **Rose is not merely an overlay**: its recent releases add 22 languages, `.modpkg` import, Quickplay/Swiftplay/Classic Rift, multi-user party reconnect, missing-mod matching and improved close/restart recovery. Our plan includes them.
2. **Wildflover is much broader than skins**: SkinLab, file format conversion, mod health and repair, client themes, P2P transfer, marketplace, Discord, OP.GG, TTS, hotkeys, app lifecycle and performance mode all appear in the dossier. Each belongs in the matrix.
3. **Full parity is not necessarily shippable parity**: unofficial paid skins, bypass protection and forced game interaction are tracked as excluded/gated, rather than included in commercial product code.
4. **LAAP-specific differentiation**: its encrypted personal vault can bind different customization presets to each saved local account while Studio remains vault-free. Neither reference supplies that exact integrated workflow.
5. **Commercial infrastructure isn't free**: party and marketplace needs authentication and moderation even after Team account API retirement; never resurrect cloud Riot account sharing to achieve them.
6. **Windows-first reality**: LTK Manager currently lists Windows 10/11; do not claim macOS parity for game patching without independent native proof.
7. **Asset rights matter**: storing a file on a local user's machine does not automatically grant rights to redistribute it via a marketplace or friend's computer.
8. **No-one-millisecond marketing**: benchmark warm presets and archive imports across machines before claims.

## Required interpretation of matrix decisions

- `IMPLEMENT_OR_ADAPT`: build an original LAAP capability after normal dependency/rights checks, with working tests.
- `OPTIONAL_WITH_CONSENT`: opt-in network/privacy/provider feature, appropriate rate limits and data minimization.
- `CONDITIONAL_REDESIGN`: ship safe related UX or feature-disabled contract until technical, licensing and policy gate explicitly passes.
- `EXCLUDE_AS_DESCRIBED`: preserve parity trace in documentation but do not ship the original method; include supported legal alternative if one exists.

**Do not confuse this matrix with proof of actual behavior in Wildflover v4.0.7**: original ZIP was a textual reverse-engineering report, not binaries/source. Before implementing integration, check real public APIs and perform native compatibility testing on consented systems.
