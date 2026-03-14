#!/bin/bash
# Orion IDE - Post-removal script for Linux (.deb)

# Remove the CLI symlink
rm -f /usr/local/bin/orion-ide

# Update desktop database to remove stale entries
if command -v update-desktop-database > /dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi
