#!/bin/sh
# Lisa stop signal hook — called by Claude Code when it finishes responding.
# Writes a signal file so the plugin knows the pane is ready for input.

SIGNAL_DIR=".lisa/signals"
mkdir -p "$SIGNAL_DIR"

if [ -n "$LISA_PANE_ID" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SIGNAL_DIR/pane-$LISA_PANE_ID.stopped"
fi
