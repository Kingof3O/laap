# 04 - Mod Tooling Pipeline & SkinLab

## Embedded Modding Engine

Wildflover embeds a comprehensive suite of community-developed League modding libraries inside its `runtime\` and `managers\` directories. This allows the application to extract, deconstruct, modify, and repack League of Legends assets on-the-fly without needing external command-line tools.

---

## Bundled Libraries & Utilities

### 1. LtMAO (`runtime\_vendor\LtMAO`)
**LtMAO** (League of Legends Modding Tools, developed by Tarngaye and contributors) is a Python toolkit that forms the computational backbone of Wildflover's asset processing:
* **`pyRitoFile`:** Python implementations for reading/writing proprietary Riot binary formats:
  * `wad.py`: WAD parser and writer with `WADHasher` for xxHash64 hash calculations.
  * `bin.py`: Property tree parser (`BIN`, `BINHasher`, `BINType`) for `.bin` files.
  * `skn.py`, `skl.py`: 3D skeleton and mesh structures.
  * `dds.py`, `tex.py`: Texture headers and DirectDraw Surface handling.
* **`wad_tool.py`:** Automated unpack/repack of `.wad.client` packages.
* **`Ritoddstex.py`:** Converter between League `.tex` textures and standard `.dds` formats.
* **`hapiBin.py`:** High-level abstraction for modifying game properties.
* **`hash_helper.py`:** Hash collision and dictionary lookup assistant.

### 2. Ritobin (`managers\ritobin_cli.exe`)
A high-performance C++ utility created by Crauzer/league-toolkit to convert League binary `.bin` files to readable, editable Python-like text files and back. Wildflover uses this for rapid modifications of champion parameters, animations, and skin definitions.

### 3. Mod-Tools & WAD Tools
* `wad-extract.exe` & `wad-make.exe`: Fast native WAD archive unpacker/packers.
* `mod-tools.exe`: Native tool to assemble mods and generate virtual overlay directories (`mkoverlay`).
* `hashes.game.txt` (203 MB): The CommunityDragon dictionary containing millions of pre-computed hashes mapping xxHash64 values back to original Riot asset file paths (e.g., `assets/characters/ahri/skins/skin01/...`).

---

## Community Mod Fixer (`fix_custom_fantome.py`)

Many community-created custom skins breaking across League patches due to changes in bone structures, skeleton offsets, or health bar anchoring. Wildflover bundles a 400 KB standalone script (`fix_custom_fantome.py`) authored by developer "Zavith":

### Script Responsibilities:
* **Skeleton Re-basing:** Adapts legacy custom skins created for pre-patch champion rigs to the updated base model skeletons.
* **Health Bar Anchoring (`--profile hpbar`):** Re-calculates and repositions champion health bar bones so the HUD elements don't hover incorrectly or clip underground.
* **Clean Staging:** Automatically unpacks `.fantome` archives, iterates over corrupted `.skn` and `.bin` entries, fixes them using LtMAO routines, and outputs a repaired `.fantome` package.

---

## "SkinLab" Developer Commands

Within `wildflover.exe`, an entire internal modding environment named **SkinLab** is exposed through Tauri IPC commands. This grants power users and developers tools to inspect and author mods directly:

| Command | Function |
| :--- | :--- |
| `skinlab_skins` | Enumerate available champion skins and chromas |
| `skinlab_read` | Read raw asset data from active packages |
| `skinlab_mod_open` / `close` | Open/close interactive mod editing sessions |
| `skinlab_wad_sizes` | Inspect size and compression ratio of WAD archives |
| `skinlab_locales` | Query language and localized text strings |
| `wad_to_fantome` | Convert raw game WAD files into an installable `.fantome` mod |
| `export_custom_mod_as_fantome` | Package edited assets into standard community `.fantome` format |
| `bin_to_py` / `py_to_bin` | Interactive decompilation/compilation of Riot property files |
| `wad_unpack` / `wad_pack` | Low-level archive management |
