pkgname=MarkdownRS
pkgver=0.15.0
pkgrel=1
pkgdesc="The only markdown editor you need."
arch=('x86_64')
license=('MIT')
depends=('webkit2gtk-4.1' 'openssl' 'libnm')

# We skip the source array since the binary is already built locally
package() {
  # Install binary
  install -Dm755 "$startdir/src-tauri/target/release/markdown-rs" "$pkgdir/usr/bin/markdown-rs"

  # Install desktop entry
  install -Dm644 "$startdir/markdown-rs.desktop" "$pkgdir/usr/share/applications/markdown-rs.desktop"
}
