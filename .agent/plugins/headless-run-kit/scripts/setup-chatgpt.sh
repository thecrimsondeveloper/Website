#!/usr/bin/env bash
set -euo pipefail

command -v node >/dev/null
command -v npm >/dev/null

CHROME="${CHROME_PATH:-}"
if [[ -z "$CHROME" ]]; then
  for candidate in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable; do
    [[ -x "$candidate" ]] && CHROME="$candidate" && break
  done
fi
[[ -n "$CHROME" ]] || { echo 'Chromium/Chrome not found' >&2; exit 1; }
export CHROME_PATH="$CHROME"

if [[ -z "${VK_ICD_FILENAMES:-}" ]]; then
  for candidate in /usr/share/vulkan/icd.d/lvp_icd.x86_64.json /usr/share/vulkan/icd.d/lvp_icd.aarch64.json; do
    [[ -f "$candidate" ]] && export VK_ICD_FILENAMES="$candidate" && break
  done
fi

export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
printf 'CHROME_PATH=%s\n' "$CHROME_PATH"
printf 'VK_ICD_FILENAMES=%s\n' "${VK_ICD_FILENAMES:-not-found}"
printf 'LIBGL_ALWAYS_SOFTWARE=%s\n' "$LIBGL_ALWAYS_SOFTWARE"
