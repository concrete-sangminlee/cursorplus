#!/bin/bash
# Orion IDE - Post-installation script for Linux (.deb)

# Create symlink so the binary is accessible from PATH
ln -sf "/opt/Orion IDE/orion-ide" /usr/local/bin/orion-ide

# Update desktop database so the .desktop entry is recognized
if command -v update-desktop-database > /dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi

# Update icon cache so the application icon appears correctly
if command -v gtk-update-icon-cache > /dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
