#!/bin/sh
# Lisa clear signal hook — called by Claude Code after /clear is processed.
# Writes a signal file so the plugin knows context has been cleared.

SIGNAL_DIR=".lisa/signals"
mkdir -p "$SIGNAL_DIR"

if [ -n "$LISA_PANE_ID" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SIGNAL_DIR/pane-$LISA_PANE_ID.cleared"
fi
