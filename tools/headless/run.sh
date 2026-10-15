#!/usr/bin/env bash
# Runs Halo in a GNOME Shell without a screen, with its own settings, and
# lets a script drive it and take screenshots.
#
#   tools/headless/run.sh <script> [seconds]
#
# <script> is a file in tools/headless/scripts, without ".js". Screenshots
# and the log go to $HALO_OUT (default: a folder in the system's temp).
#
#   HALO_WITH="<uuid>=<path to its extension folder> ..."
#       loads other extensions first, to show that they live side by side.
#   HALO_MONITORS=2   two virtual monitors instead of one.
#   HALO_SCHEME=light|dark   the desktop's colour scheme (default light).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export HALO_OUT="${HALO_OUT:-${TMPDIR:-/tmp}/halo-headless}"
ENV="$HALO_OUT/env"
EXTENSIONS="$ENV/data/gnome-shell/extensions"

rm -rf "$ENV/config/halo"
mkdir -p "$EXTENSIONS" "$ENV/config" "$ENV/cache" "$HALO_OUT/shots"
ln -sfn "$REPO/extension" "$EXTENSIONS/halo@thomashaiden"
ln -sfn "$HERE/driver" "$EXTENSIONS/halo-driver@test"
EXTRA=""
for pair in ${HALO_WITH:-}; do
    ln -sfn "${pair#*=}" "$EXTENSIONS/${pair%%=*}"
    EXTRA+="\"${pair%%=*}\", "
done
export EXTRA
# The scratch data folder has no fonts of its own.
ln -sfn "${XDG_DATA_HOME:-$HOME/.local/share}/fonts" "$ENV/data/fonts"

MONITORS="--virtual-monitor 1280x800"
if [ "${HALO_MONITORS:-1}" = "2" ]; then
    MONITORS="--virtual-monitor 1280x800 --virtual-monitor 1024x768"
fi
export MONITORS
export HALO_SCHEME="${HALO_SCHEME:-light}"
export HALO_SCRIPT="$HERE/scripts/$1.js"
export HALO_SECONDS="${2:-60}"
export XDG_CONFIG_HOME="$ENV/config" XDG_CACHE_HOME="$ENV/cache" XDG_DATA_HOME="$ENV/data" XDG_STATE_HOME="$ENV/state"
export G_MESSAGES_DEBUG=Gjs-Console
unset WAYLAND_DISPLAY DISPLAY

exec dbus-run-session -- bash -c '
gsettings set org.gnome.shell enabled-extensions "[$EXTRA\"halo@thomashaiden\", \"halo-driver@test\"]"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version "99"
gsettings set org.gnome.desktop.interface color-scheme "$( [ "$HALO_SCHEME" = dark ] && echo prefer-dark || echo default )"
gsettings set org.gnome.desktop.interface enable-hot-corners false
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.wm.preferences num-workspaces 4
gsettings set org.gnome.desktop.background picture-options none
gsettings set org.gnome.desktop.background color-shading-type solid
gsettings set org.gnome.desktop.background primary-color "#101a38"
timeout "$HALO_SECONDS" gnome-shell --headless $MONITORS --wayland-display halo-test --no-x11 2>&1'
