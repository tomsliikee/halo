#!/usr/bin/env bash
# Watches GNOME Shell from outside: every 2 s it asks the shell for a
# property over D-Bus, which the shell answers on its main thread. When it
# does not answer, the state of each of the shell's threads (running or
# waiting, and in which kernel call) goes to ~/.cache/halo/hangwatch.log,
# written to disk at once, so a frozen screen after waking leaves evidence;
# on the second miss also the native stacks (eu-stack) and the JavaScript
# stack (gjs_dumpstack through gdb, into the journal and the log).
#
#   systemd-run --user --unit=halo-hangwatch tools/hangwatch.sh
#   systemctl --user stop halo-hangwatch
set -u
# No symbol downloads: they take long, and the network may be down after waking.
export DEBUGINFOD_URLS=

LOG="${XDG_CACHE_HOME:-$HOME/.cache}/halo/hangwatch.log"
mkdir -p "$(dirname "$LOG")"

ask() {
    timeout 3 gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion >/dev/null 2>&1
}

snapshot() {
    local pid=$1
    echo "== $(date -Is) shell $pid does not answer (uptime $(cut -d' ' -f1 /proc/uptime) s)"
    for task in /proc/"$pid"/task/*; do
        # state, user and system ticks; wchan names the kernel call it waits in
        read -r -a stat < "$task/stat"
        printf '  %-16s state=%s utime=%s stime=%s wchan=%s\n' \
            "$(cat "$task/comm")" "${stat[2]}" "${stat[13]}" "${stat[14]}" "$(cat "$task/wchan" 2>/dev/null)"
    done
}

echo "== $(date -Is) watching" >> "$LOG"
misses=0
last=$(date +%s)
while true; do
    sleep 2
    now=$(date +%s)
    # A long gap between two looks: the computer slept.
    if (( now - last > 10 )); then
        echo "== $(date -Is) woke after $((now - last)) s" >> "$LOG"
        sync "$LOG"
    fi
    last=$now
    pid=$(pgrep -u "$USER" -x gnome-shell | head -1)
    [ -z "$pid" ] && continue
    if ask; then
        (( misses > 0 )) && { echo "== $(date -Is) answers again after $misses misses" >> "$LOG"; sync "$LOG"; }
        misses=0
        continue
    fi
    misses=$((misses + 1))
    # Several looks a few seconds apart show whether it runs in a loop
    # (utime grows) or waits (wchan stays).
    if (( misses <= 5 )); then
        snapshot "$pid" >> "$LOG"
        sync "$LOG"
    fi
    # Still stuck on the second look: the native stacks, and the JavaScript
    # stack, which the shell writes to the journal when asked through gdb.
    if (( misses == 2 )); then
        { echo "-- native stacks"; timeout 20 eu-stack -p "$pid" 2>&1 | head -150; } >> "$LOG"
        timeout 20 gdb -p "$pid" -batch -ex 'set debuginfod enabled off' -ex 'call (void)gjs_dumpstack()' >/dev/null 2>&1
        sleep 1
        { echo "-- shell journal"; journalctl --user -o short-iso -n 120 _PID="$pid" --no-pager 2>&1; } >> "$LOG"
        sync "$LOG"
    fi
done
