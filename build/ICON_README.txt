Orion IDE - Icon Assets Required for Packaging
================================================

Place the following icon files in this directory before building:

  build/icon.ico       - Windows icon (256x256, multi-size ICO)
  build/icon.icns      - macOS icon (512x512 and 1024x1024 variants)
  build/icon.png       - Fallback PNG icon (512x512)
  build/dmg-background.png - macOS DMG installer background (660x500)

For Linux, place PNG icons in the build/icons/ directory at these sizes:

  build/icons/16x16.png
  build/icons/32x32.png
  build/icons/48x48.png
  build/icons/64x64.png
  build/icons/128x128.png
  build/icons/256x256.png
  build/icons/512x512.png

You can generate all platform icons from a single 1024x1024 source PNG
using electron-icon-builder:

  npx electron-icon-builder --input=source-icon.png --output=build
