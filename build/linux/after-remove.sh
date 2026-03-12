#!/bin/bash

# Remove CLI symlink
rm -f /usr/local/bin/orion

# Update desktop database
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Update icon cache
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
