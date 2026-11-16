# Verify the repo: frontend and Rust checks, the same set CI runs.
default: check

# Full check: Svelte types, Biome lint, and Clippy.
check:
    bun run check

# Linter alone.
lint:
    bunx biome check .

# Rewrite Rust and frontend formatting.
format:
    bun run fix

# Run the frontend (Vitest) and Rust test suites.
test:
    bun run test

# Build the release binary (no installers).
build:
    bun run build

# Tauri dev with hot reload.
dev:
    bun run dev

# makepkg from PKGBUILD.
package:
    bun run package

# Remove build artifacts and node_modules.
clean:
    bun run clean

# Refresh dependencies to their latest allowed versions.
update:
    bun run update

# package.json script: bench.
bench:
    bun run bench

# package.json script: check:backend.
check-backend:
    bun run check:backend

# package.json script: check:frontend.
check-frontend:
    bun run check:frontend

# package.json script: check:types.
check-types:
    bun run check:types

# package.json script: coverage.
coverage:
    bun run coverage

# package.json script: crates.
crates:
    bun run crates

# package.json script: fix:backend.
fix-backend:
    bun run fix:backend

# package.json script: fix:frontend.
fix-frontend:
    bun run fix:frontend

# package.json script: gen-icons.
icons:
    bun run gen-icons

# package.json script: pack.
pack:
    bun run pack

# package.json script: pkg-install.
pkg-install:
    bun run pkg-install

# package.json script: website.
website:
    bun run website

# Bump the version from conventional commits and tag it.
release:
    cog bump --auto
