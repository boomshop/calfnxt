#!/usr/bin/env bash
# Cut a calfNXT suite release: bump version, tag, build ui-dist tarball,
# push, and publish GitHub Release assets (ui-dist is NOT committed).
#
# Usage:
#   ./tools/release.sh                  # interactive (shows current version first)
#   ./tools/release.sh 0.2.0            # set exact version
#   ./tools/release.sh patch|minor|major
#   ./tools/release.sh --dry-run minor
#   ./tools/release.sh --no-push 0.2.0
#   ./tools/release.sh --yes minor      # no confirmation prompt
#
# See VERSIONING.md for bump criteria.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
NO_PUSH=0
YES=0
ALLOW_DIRTY=0
VERSION_ARG=""

usage() {
  cat <<'EOF'
Cut a calfNXT suite release: bump version, tag, build ui-dist tarball,
push, and publish GitHub Release assets (ui-dist is NOT committed).

Usage:
  ./tools/release.sh                  # interactive (shows current version first)
  ./tools/release.sh 0.2.0            # set exact version
  ./tools/release.sh patch|minor|major
  ./tools/release.sh --dry-run minor
  ./tools/release.sh --no-push 0.2.0
  ./tools/release.sh --yes minor      # no confirmation prompt

Options:
  --dry-run       Print actions; do not modify git, build, or upload
  --no-push       Commit/tag/build/pack locally; skip git push and gh release
  --yes, -y       Skip the final confirmation prompt
  --allow-dirty   Allow a dirty working tree (not recommended)
  -h, --help      Show this help

See VERSIONING.md for bump criteria.
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --yes|-y) YES=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage 1
      ;;
    *)
      if [[ -n "$VERSION_ARG" ]]; then
        echo "error: unexpected extra argument: $1" >&2
        usage 1
      fi
      VERSION_ARG="$1"
      shift
      ;;
  esac
done

# --- helpers -----------------------------------------------------------------

read_cmake_version() {
  sed -nE 's/^[[:space:]]*VERSION[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' \
    "$ROOT/CMakeLists.txt" | head -n1
}

is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

bump_semver() {
  local ver="$1" kind="$2"
  local major minor patch
  IFS=. read -r major minor patch <<<"$ver"
  case "$kind" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
    *) echo "error: invalid bump kind: $kind" >&2; return 1 ;;
  esac
  echo "${major}.${minor}.${patch}"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "dry-run: $*"
  else
    "$@"
  fi
}

# --- preflight ---------------------------------------------------------------

CURRENT="$(read_cmake_version)"
if [[ -z "$CURRENT" ]] || ! is_semver "$CURRENT"; then
  echo "error: could not read suite version from CMakeLists.txt" >&2
  exit 1
fi

echo "==> current suite version: $CURRENT"

if [[ ! -d "$ROOT/.git" ]]; then
  echo "error: not a git repository" >&2
  exit 1
fi

if [[ "$ALLOW_DIRTY" -eq 0 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "error: working tree is dirty; commit/stash first or pass --allow-dirty" >&2
    git status --short >&2
    exit 1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found (needed to build ui/dist)" >&2
  exit 1
fi

if [[ "$NO_PUSH" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "error: gh not found (needed for GitHub Release); install GitHub CLI or pass --no-push" >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "error: gh is not authenticated; run: gh auth login" >&2
    exit 1
  fi
fi

# --- resolve new version (always show current first; then ask if needed) ------

NEW=""
if [[ -z "$VERSION_ARG" ]]; then
  echo
  echo "Enter new version as X.Y.Z, or bump kind: patch | minor | major"
  echo "(see VERSIONING.md)"
  read -r -p "New version [current $CURRENT]: " VERSION_ARG
  VERSION_ARG="${VERSION_ARG// /}"
  if [[ -z "$VERSION_ARG" ]]; then
    echo "error: no version given" >&2
    exit 1
  fi
fi

case "$VERSION_ARG" in
  patch|minor|major)
    NEW="$(bump_semver "$CURRENT" "$VERSION_ARG")"
    echo "==> bump $VERSION_ARG: $CURRENT → $NEW"
    ;;
  *)
    NEW="$VERSION_ARG"
    if ! is_semver "$NEW"; then
      echo "error: invalid version '$NEW' (expected X.Y.Z or patch|minor|major)" >&2
      exit 1
    fi
    echo "==> set version: $CURRENT → $NEW"
    ;;
esac

if [[ "$NEW" == "$CURRENT" ]]; then
  echo "error: new version equals current ($CURRENT)" >&2
  exit 1
fi

TAG="v${NEW}"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists" >&2
  exit 1
fi

if [[ "$YES" -eq 0 ]]; then
  echo
  read -r -p "Proceed with release $TAG? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "aborted."; exit 1 ;;
  esac
fi

# --- bump version files ------------------------------------------------------

echo "==> bump version files to $NEW"

bump_files() {
  # CMake project VERSION
  sed -i -E "s/^([[:space:]]*VERSION[[:space:]]+)[0-9]+\.[0-9]+\.[0-9]+/\\1${NEW}/" \
    "$ROOT/CMakeLists.txt"

  local json
  for json in "$ROOT"/dsp/*/*.plugin.json; do
    [[ -f "$json" ]] || continue
    sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[0-9]+\.[0-9]+\.[0-9]+(\")/\\1${NEW}\\2/" \
      "$json"
  done

  # package.json + package-lock.json root version (no git tag from npm)
  (cd "$ROOT/ui" && npm version "$NEW" --no-git-tag-version --allow-same-version >/dev/null)
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: would bump CMakeLists.txt, dsp/*/*.plugin.json, ui/package.json(+lock)"
else
  bump_files
fi

# --- commit + tag ------------------------------------------------------------

echo "==> commit + annotated tag $TAG"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: git add + commit 'release: $NEW' + git tag -a $TAG"
else
  git add \
    CMakeLists.txt \
    ui/package.json \
    ui/package-lock.json \
    dsp/*/*.plugin.json
  git commit -m "release: ${NEW}"
  git tag -a "$TAG" -m "calfNXT ${NEW}"
fi

# --- build UI + pack tarball -------------------------------------------------

OUT_DIR="$ROOT/dist/releases"
UI_DIST_TAR="${OUT_DIR}/calfnxt-${NEW}-ui-dist.tar.xz"
UI_DIST_SHA="${UI_DIST_TAR}.sha256"
SRC_TAR="${OUT_DIR}/calfnxt-${NEW}.tar.gz"
SRC_SHA="${SRC_TAR}.sha256"

echo "==> build UI (npm ci + npm run build)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: npm ci && npm run build in ui/"
else
  (cd "$ROOT/ui" && npm ci && npm run build)
  # CMake normally creates this stamp; include it for CALFNXT_USE_PREBUILT_UI.
  touch "$ROOT/ui/dist/.stamp"
fi

echo "==> pack release assets → $OUT_DIR"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: would write $UI_DIST_TAR (+ sha256) and $SRC_TAR (+ sha256)"
else
  mkdir -p "$OUT_DIR"
  rm -f "$UI_DIST_TAR" "$UI_DIST_SHA" "$SRC_TAR" "$SRC_SHA"

  # Extract at the source-tree root → ui/dist/...
  tar -C "$ROOT" -cJf "$UI_DIST_TAR" ui/dist
  (
    cd "$OUT_DIR"
    sha256sum "$(basename "$UI_DIST_TAR")" >"$(basename "$UI_DIST_SHA")"
  )

  git archive --format=tar.gz --prefix="calfnxt-${NEW}/" -o "$SRC_TAR" "$TAG"
  (
    cd "$OUT_DIR"
    sha256sum "$(basename "$SRC_TAR")" >"$(basename "$SRC_SHA")"
  )

  echo "    $UI_DIST_TAR"
  echo "    $UI_DIST_SHA"
  echo "    $SRC_TAR"
  echo "    $SRC_SHA"
fi

# --- release notes -----------------------------------------------------------

NOTES_FILE="$(mktemp)"
cleanup() { rm -f "$NOTES_FILE"; }
trap cleanup EXIT

PREV_TAG=""
if [[ "$DRY_RUN" -eq 0 ]]; then
  PREV_TAG="$(git describe --tags --abbrev=0 --match 'v*' "${TAG}^" 2>/dev/null || true)"
else
  PREV_TAG="$(git describe --tags --abbrev=0 --match 'v*' HEAD 2>/dev/null || true)"
fi

{
  echo "## calfNXT ${NEW}"
  echo
  if [[ -n "$PREV_TAG" ]]; then
    echo "Changes since ${PREV_TAG}:"
    echo
    if [[ "$DRY_RUN" -eq 0 ]]; then
      git log --pretty=format:'- %s (%h)' "${PREV_TAG}..${TAG}" 2>/dev/null || true
    else
      git log --pretty=format:'- %s (%h)' "${PREV_TAG}..HEAD" 2>/dev/null || true
    fi
    echo
  else
    echo "Release ${NEW}."
    echo
  fi
  echo
  echo "### Distro / offline UI"
  echo
  echo "- Asset \`calfnxt-${NEW}-ui-dist.tar.xz\`: unpack at the source tree root to get \`ui/dist/\`."
  echo "- Configure with \`-DCALFNXT_USE_PREBUILT_UI=ON\` (no npm/network needed for the UI)."
  echo "- See VERSIONING.md and README (Packaging / offline UI)."
} >"$NOTES_FILE"

if [[ "$NO_PUSH" -eq 1 ]]; then
  echo "==> skip push (--no-push)"
  echo "==> skip GitHub release (--no-push); assets are under $OUT_DIR"
  echo "==> done (local only): $TAG"
  exit 0
fi

echo "==> git push + push tag $TAG"
run git push
run git push origin "$TAG"

# --- GitHub release ----------------------------------------------------------

echo "==> GitHub release $TAG"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: gh release create $TAG with ui-dist + source archives"
else
  gh release create "$TAG" \
    --title "calfNXT ${NEW}" \
    --notes-file "$NOTES_FILE" \
    "$UI_DIST_TAR" \
    "$UI_DIST_SHA" \
    "$SRC_TAR" \
    "$SRC_SHA"
fi

echo "==> done: $TAG"
echo "    Release assets published; ui/dist and tarballs are not committed."
