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

# Full Tauri bundles: AppImage, deb, rpm, NSIS.
bundle:
    bunx tauri build

# Verify commit messages in a range (`just commits origin/main..HEAD`).
commits range="origin/main..HEAD":
    cog check {{range}}

# Regenerate the SvelteKit types before a type check.
sync:
    bunx svelte-kit sync

# Static website into website/dist.
website-build:
    bunx --bun vite build --config website/vite.config.js

# App frontend only (no Tauri bundle).
frontend-build:
    bunx --bun vite build

# Verify commit messages in a range (`just commits origin/main..HEAD`).

# Biome over a file list, as the pre-commit hook passes it.
format-staged *files:
    bunx biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {{files}}

# rustfmt over a file list, as the pre-commit hook passes it.
format-rust-staged *files:
    cargo fmt --manifest-path src-tauri/Cargo.toml -- {{files}}

# Verify a commit message file, as the commit-msg hook passes it.
commit-check file:
    cog verify --file {{file}}
