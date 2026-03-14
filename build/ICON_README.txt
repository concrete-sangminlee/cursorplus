Orion IDE - Icon Assets Required for Packaging
================================================

Before building distributable packages, you must place the correct icon
files in this directory. All platform icons can be generated from a single
1024x1024 (or larger) source PNG with an alpha channel.

-------------------------------------------------------------
Source file
-------------------------------------------------------------

Prepare a high-resolution source image:

  source-icon.png   - 1024x1024 minimum, PNG with transparency

-------------------------------------------------------------
Required output files by platform
-------------------------------------------------------------

Windows (build/icon.ico)
  A multi-resolution ICO file containing at least these sizes:
    16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256
  electron-builder expects this file at: build/icon.ico

macOS (build/icon.icns)
  An Apple ICNS file containing at least these sizes:
    16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
  electron-builder expects this file at: build/icon.icns

Linux (build/icons/ directory)
  Individual PNG files named by size in the build/icons/ directory:
    build/icons/16x16.png
    build/icons/32x32.png
    build/icons/48x48.png
    build/icons/64x64.png
    build/icons/128x128.png
    build/icons/256x256.png
    build/icons/512x512.png

-------------------------------------------------------------
Additional assets
-------------------------------------------------------------

  build/icon.png            - 512x512 fallback PNG icon
  build/dmg-background.png  - macOS DMG installer background (660x500)

-------------------------------------------------------------
Generating all icons automatically
-------------------------------------------------------------

Option 1 - electron-icon-builder (recommended)

  Install:
    npm install --save-dev electron-icon-builder

  Generate all formats at once:
    npx electron-icon-builder --input=source-icon.png --output=build

  This produces icon.ico, icon.icns, and the icons/ directory with every
  required PNG size.

Option 2 - Manual generation with ImageMagick

  Windows ICO:
    magick source-icon.png -define icon:auto-resize=256,128,64,48,32,24,16 build/icon.ico

  macOS ICNS (requires macOS with iconutil):
    mkdir -p build/icon.iconset
    for size in 16 32 64 128 256 512; do
      magick source-icon.png -resize ${size}x${size} build/icon.iconset/icon_${size}x${size}.png
      magick source-icon.png -resize $((size*2))x$((size*2)) build/icon.iconset/icon_${size}x${size}@2x.png
    done
    iconutil -c icns build/icon.iconset -o build/icon.icns
    rm -rf build/icon.iconset

  Linux PNGs:
    mkdir -p build/icons
    for size in 16 32 48 64 128 256 512; do
      magick source-icon.png -resize ${size}x${size} build/icons/${size}x${size}.png
    done

  Fallback PNG:
    magick source-icon.png -resize 512x512 build/icon.png

-------------------------------------------------------------
Verification
-------------------------------------------------------------

After generating, confirm the following files exist:

  build/icon.ico            (Windows)
  build/icon.icns           (macOS)
  build/icon.png            (fallback)
  build/icons/16x16.png     (Linux)
  build/icons/32x32.png     (Linux)
  build/icons/48x48.png     (Linux)
  build/icons/64x64.png     (Linux)
  build/icons/128x128.png   (Linux)
  build/icons/256x256.png   (Linux)
  build/icons/512x512.png   (Linux)
  build/dmg-background.png  (macOS DMG - must be created separately)
