pkgname=MarkdownRS
pkgver=0.18.0
pkgrel=1
pkgdesc="The only markdown editor you need."
arch=('x86_64')
license=('MIT')
depends=('webkit2gtk-4.1' 'openssl' 'libnm')

# We skip the source array since the binary is already built locally
package() {
  # Install binary
  install -Dm755 "$startdir/../src-tauri/target/release/markdown-rs" "$pkgdir/usr/bin/markdown-rs"

  # Install desktop entry
  install -Dm644 "$startdir/../markdown-rs.desktop" "$pkgdir/usr/share/applications/markdown-rs.desktop"

  # Install icons
  install -Dm644 "$startdir/../src-tauri/icons/icon.png" "$pkgdir/usr/share/icons/hicolor/512x512/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/256x256.png" "$pkgdir/usr/share/icons/hicolor/256x256/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/64x64.png" "$pkgdir/usr/share/icons/hicolor/64x64/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/32x32.png" "$pkgdir/usr/share/icons/hicolor/32x32/apps/markdown-rs.png"
}
