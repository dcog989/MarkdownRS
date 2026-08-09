pkgname=MarkdownRS
pkgver=1.51.2
pkgrel=1
pkgdesc="The only Markdown editor you need."
arch=('x86_64')
license=('MIT')
depends=('webkit2gtk-4.1' 'openssl' 'libnm')
source=()
sha256sums=()

# Binary is already built locally; this only packages it and the support files.
package() {
  install -Dm755 "$startdir/../src-tauri/target/release/markdown-rs" "$pkgdir/usr/bin/markdown-rs"

  install -Dm644 "$startdir/../markdown-rs.desktop" "$pkgdir/usr/share/applications/markdown-rs.desktop"

  install -Dm644 "$startdir/../src-tauri/icons/icon.png" "$pkgdir/usr/share/icons/hicolor/512x512/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/256x256.png" "$pkgdir/usr/share/icons/hicolor/256x256/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/64x64.png" "$pkgdir/usr/share/icons/hicolor/64x64/apps/markdown-rs.png"
  install -Dm644 "$startdir/../src-tauri/icons/32x32.png" "$pkgdir/usr/share/icons/hicolor/32x32/apps/markdown-rs.png"
}
