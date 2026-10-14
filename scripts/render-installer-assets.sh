#!/bin/sh
set -eu
# Run from the repo root; SVGs resolve the existing game icon relative to themselves.
command -v rsvg-convert >/dev/null
command -v magick >/dev/null
for name in nsis-sidebar nsis-header; do
  task_png="${TMPDIR:-/tmp}/laap-${name}-render.png"
  rsvg-convert -o "$task_png" "apps/desktop/src-tauri/icons/${name}.svg"
  magick "$task_png" -background '#081420' -alpha remove -alpha off -type TrueColor "BMP3:apps/desktop/src-tauri/icons/${name}.bmp"
  magick "apps/desktop/src-tauri/icons/${name}.bmp" "docs/assets/${name}.png"
done
