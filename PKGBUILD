pkgname=MarkdownRS
pkgver=1.65.0
pkgrel=1
pkgdesc="The only Markdown editor you need."
arch=('x86_64')
license=('GPL-3.0-only')
options=('!debug')
depends=('webkit2gtk-4.1' 'openssl' 'libnm')
source=()
sha256sums=()

# Binary is already built locally; this only packages it and the support files.
package() {
  install -Dm755 "$startdir/../src-tauri/target/release/markdownrs" "$pkgdir/usr/bin/markdownrs"

  install -Dm644 "$startdir/../markdownrs.desktop" "$pkgdir/usr/share/applications/markdownrs.desktop"

  install -Dm644 "$startdir/../src-tauri/icons/icon.png" "$pkgdir/usr/share/icons/hicolor/512x512/apps/markdownrs.png"
  install -Dm644 "$startdir/../src-tauri/icons/256x256.png" "$pkgdir/usr/share/icons/hicolor/256x256/apps/markdownrs.png"
  install -Dm644 "$startdir/../src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/markdownrs.png"
  install -Dm644 "$startdir/../src-tauri/icons/64x64.png" "$pkgdir/usr/share/icons/hicolor/64x64/apps/markdownrs.png"
  install -Dm644 "$startdir/../src-tauri/icons/32x32.png" "$pkgdir/usr/share/icons/hicolor/32x32/apps/markdownrs.png"
}
