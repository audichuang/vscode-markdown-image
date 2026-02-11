#!/bin/sh

# Try clipboard tools in order of preference:
# 1. wl-paste (Wayland)
# 2. xclip (X11)

if command -v wl-paste >/dev/null 2>&1; then
    # Wayland: use wl-paste
    if wl-paste --list-types 2>/dev/null | grep -q image/png; then
        wl-paste --type image/png > "$1" 2>/dev/null
        echo "$1"
    else
        echo "no image"
    fi
elif command -v xclip >/dev/null 2>&1; then
    # X11: use xclip
    if xclip -selection clipboard -target image/png -o >/dev/null 2>&1; then
        xclip -selection clipboard -target image/png -o > "$1" 2>/dev/null
        echo "$1"
    else
        echo "no image"
    fi
else
    echo "no clipboard tool" >&2
    exit 1
fi
