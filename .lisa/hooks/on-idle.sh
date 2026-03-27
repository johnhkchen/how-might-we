#!/bin/sh
# Lisa idle signal hook — called by Claude Code on idle_prompt notification.
# Writes a signal file so the plugin knows this session finished its work.

SIGNAL_DIR=".lisa/signals"
mkdir -p "$SIGNAL_DIR"

if [ -n "$LISA_PANE_ID" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SIGNAL_DIR/pane-$LISA_PANE_ID.idle"
fi
