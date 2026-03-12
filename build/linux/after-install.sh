#!/bin/bash

# Create symlink for CLI usage
ln -sf /opt/${productFilename}/orion-ide /usr/local/bin/orion

# Update desktop database
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Update icon cache
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi

# Update MIME database
if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
