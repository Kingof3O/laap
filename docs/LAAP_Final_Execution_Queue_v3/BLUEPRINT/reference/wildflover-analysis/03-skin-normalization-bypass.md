# 03 - Skin Normalization & Anti-Skinhack Bypass (`ltk_base_skin.py`)

## The Problem: LTK's Built-in Anti-Skinhack Gate

The open-source **League Toolkit (LTK)** was created strictly for custom community modifications (fan-made skins, custom HUDs, anime models). To prevent users from using LTK to unlock Riot's official paid skins for free, the LTK authors built in a client-side verification check:
1. When a mod is loaded into `skin0` (the default champion base skin slot), LTK inspects its internal BIN property sheets and asset hashes.
2. If the files or names match known official skins, LTK halts and throws an error:
   ```
   "skin0 is another skin: ... names Skin<n>"
   ```
   The overlay is rejected as an illegal skinhack.

---

## The Solution: `ltk_base_skin.py`

Wildflover overcomes this protection mechanism through a specialized Python bridge script: `runtime\bridge\ltk_base_skin.py`.

The script implements a two-stage bypass technique documented in its code as derived from community research (`Null-HowToDo/03-base-skin-bypass`):

```
LTK base-skin normalizer bridge.

Makes a skin's skin0 object read as the champion's real base skin where the LTK
patcher's base-skin check looks, so the overlay is accepted instead of refused
as a skinhack. Two parts, per the method in Null-HowToDo/03-base-skin-bypass:

  (1) identity borrow - championSkinName / skinAudioProperties / skinVOProperties
      on skin0 are replaced with the game's real base skin0 values (dropped when
      the base has none). The DLL reads skin0's identity as the base.
  (2) mesh repoint - skinMeshProperties skeleton/simpleSkin are rewritten to novel
      (_nmx) paths and the meshes shipped under the new path hashes with trailing
      bytes, so neither the path nor the raw content matches a known skin.
```

---

## Detailed Bypass Mechanics

### 1. Identity Borrowing
LTK's patcher scans the `SkinCharacterDataProperties` block in the champion's `.bin` file to inspect identity strings:
* `championSkinName`
* `tagEventList`
* `bankUnits` (Audio banks and VO properties)

**The Normalizer Script:**
1. Loads the actual unmodded base skin `.bin` from `<League>/Game/DATA/FINAL/Champions/<Champion>.wad.client`.
2. Replaces the mod's `championSkinName` with the champion's real base name.
3. Neutralizes audio strings using regex (`_neutralize_audio_names`):
   ```python
   SKIN_N_RE = re.compile(r"(?i)skin\d+")
   
   def _neutral_name(s: str) -> str:
       out = re.sub(r"_{2,}", "_", SKIN_N_RE.sub("", s)).strip(" _")
       return out or "base"
   ```
   Any occurrences of `"Skin1"`, `"Skin2"`, etc. in `tagEventList` or `bankUnits` are stripped. Because the game loads actual audio banks from `bankPath` rather than the name string, the audio continues to function in-game while tricking LTK into believing it is inspecting default assets.

### 2. Mesh Repointing & Hash Mutation
LTK also computes hashes of mesh paths (`skeleton` and `simpleSkin`) to verify they don't match Riot's official asset databases:
* **Novel File Extensions:** The script rewrites file paths to end with a novel `_nmx` extension:
  ```python
  NMX_RE = re.compile(r"(\.[A-Za-z0-9]+)$")
  # e.g., Ahri_Skin05.skn -> Ahri_Skin05_nmx.skn
  ```
* **Trailing Byte Padding:** The script appends 16 null bytes (`\x00` * 16) to the end of the mesh file:
  ```python
  TRAILING = b"\x00" * 16
  ```
  The 3D model parser in League reads mesh geometry based on header length fields and ignores trailing padding. However, cryptographic and XXHash checks computed by LTK produce entirely different hashes, successfully defeating the anti-skinhack fingerprinting check.

---

## Execution Flow
1. User selects an official skin in Wildflover.
2. Wildflover extracts the target skin files from the local League WAD archives.
3. `wildflover.exe` invokes:
   ```bash
   python.exe runtime\bridge\ltk_base_skin.py <staged_mod_folder> "<league_dir>/Game/DATA/FINAL/Champions"
   ```
4. The normalized assets are packed into an LTK-compatible `.fantome` package.
5. The package is handed off to `LeagueToolFlop.dll` via `/import`, which orders the headless LTK patcher to mount it.
