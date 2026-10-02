#!/usr/bin/env bash
# Website shots + publish to calfnxt.org via SFTP.
#
# The Hetzner account is SFTP-only (no SSH shell) — same as Dolphin’s
# passwordless sftp://boomsh@www335.your-server.de/… connection.
#
# Usage:
#   ./tools/website.sh shots|studio          # screenshots only
#   ./tools/website.sh publish               # upload full website/ (incl. images)
#   ./tools/website.sh all|full              # screenshots, then upload everything
#   ./tools/website.sh site|website          # upload index.html + styles.css only
#
#   ./tools/website.sh studio -- reverb night calfnxt
#   ./tools/website.sh publish --dry-run
#   ./tools/website.sh full --delete
#
# Overrides (optional):
#   CALFNXT_SFTP_HOST=www335.your-server.de
#   CALFNXT_SFTP_USER=boomsh
#   CALFNXT_SFTP_PATH=public_html/calfnxt.org
#   CALFNXT_WEBSITE_DIR=/path/to/website
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${CALFNXT_SFTP_HOST:-www335.your-server.de}"
USER="${CALFNXT_SFTP_USER:-boomsh}"
REMOTE="${CALFNXT_SFTP_PATH:-public_html/calfnxt.org}"
LOCAL="${CALFNXT_WEBSITE_DIR:-$ROOT/website}"
TARGET="${USER}@${HOST}"

CMD=""
DRY_RUN=0
DELETE=0
STUDIO_ARGS=()

usage() {
  cat <<EOF
Website screenshots and/or publish to ${TARGET}:${REMOTE}

Usage:
  $(basename "$0") shots|studio [studio-args...]
                                              Generate screenshots only
  $(basename "$0") publish [--dry-run] [--delete]
                                              Upload the full website/ tree
  $(basename "$0") all|full [--dry-run] [--delete] [--] [studio-args...]
                                              Generate screenshots, then upload everything
  $(basename "$0") site|website [--dry-run]
                                              Upload index.html + styles.css (no images)

Options:
  --dry-run   Show plan; skip capture and upload
  --delete    Remove remote files that are not in website/ (publish/all/full; needs lftp)
  -h, --help  Show this help

Studio args are forwarded to \`npm run studio\` (plugin id, mode, accent, …).
EOF
  exit "${1:-0}"
}

if [[ $# -eq 0 ]]; then
  usage 1
fi

case "$1" in
  shots | studio)
    CMD="shots"
    shift
    ;;
  publish)
    CMD="publish"
    shift
    ;;
  all | full)
    CMD="all"
    shift
    ;;
  site | website)
    CMD="site"
    shift
    ;;
  -h | --help) usage 0 ;;
  *)
    echo "error: unknown command: $1" >&2
    usage 1
    ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --delete)
      DELETE=1
      shift
      ;;
    --)
      shift
      STUDIO_ARGS+=("$@")
      break
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage 1
      ;;
    *)
      if [[ "$CMD" == "shots" || "$CMD" == "all" ]]; then
        STUDIO_ARGS+=("$1")
        shift
      else
        echo "error: unexpected argument: $1" >&2
        usage 1
      fi
      ;;
  esac
done

if [[ "$DELETE" -eq 1 && "$CMD" != "publish" && "$CMD" != "all" ]]; then
  echo "error: --delete only applies to publish / all / full" >&2
  exit 1
fi

need_website_dir() {
  if [[ ! -d "$LOCAL" ]]; then
    echo "error: website dir missing: $LOCAL" >&2
    exit 1
  fi
  if [[ ! -f "$LOCAL/index.html" ]]; then
    echo "error: no index.html in $LOCAL" >&2
    exit 1
  fi
  if [[ ! -f "$LOCAL/styles.css" ]]; then
    echo "error: no styles.css in $LOCAL" >&2
    exit 1
  fi
}

need_sftp() {
  if ! command -v sftp >/dev/null 2>&1; then
    echo "error: sftp not found (OpenSSH client required)" >&2
    exit 1
  fi
}

generate_shots() {
  echo "==> screenshots → ${LOCAL}/images/<mode>/<accent>/"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ ${#STUDIO_ARGS[@]} -gt 0 ]]; then
      echo "dry-run: npm run studio -- ${STUDIO_ARGS[*]}"
    else
      echo "dry-run: npm run studio"
    fi
    return 0
  fi
  if [[ ! -d "$ROOT/studio" ]]; then
    echo "error: studio/ missing" >&2
    exit 1
  fi
  (
    cd "$ROOT"
    if [[ ${#STUDIO_ARGS[@]} -gt 0 ]]; then
      npm run studio -- "${STUDIO_ARGS[@]}"
    else
      npm run studio
    fi
  )
}

# --- dry-run listing (upload modes) ------------------------------------------

show_remote_plan() {
  echo "==> local:  $LOCAL"
  echo "==> remote: sftp://${TARGET}/${REMOTE}"
  echo "==> local tree:"
  (
    cd "$LOCAL"
    if [[ "$CMD" == "site" ]]; then
      printf '  index.html\n  styles.css\n'
    else
      find . -type f ! -name '.DS_Store' ! -name 'Thumbs.db' | sort | sed 's|^\./|  |'
    fi
  )
  echo "==> remote listing:"
  printf 'ls -l %s\nls -l %s/images\n' "$REMOTE" "$REMOTE" \
    | sftp -b - "$TARGET" 2>/dev/null \
    | grep -v '^sftp>' \
    || true
  if [[ "$DELETE" -eq 1 ]]; then
    if command -v lftp >/dev/null 2>&1; then
      echo "==> --delete would use lftp mirror -R --delete"
    else
      echo "==> note: --delete needs lftp (not installed); upload-only with sftp"
    fi
  fi
  echo "==> dry-run done (nothing uploaded)"
}

# --- upload with lftp (mirror; supports --delete) ----------------------------

publish_lftp_all() {
  local del_flag=()
  if [[ "$DELETE" -eq 1 ]]; then
    del_flag=(--delete)
    echo "==> lftp mirror -R --delete"
  else
    echo "==> lftp mirror -R"
  fi

  lftp -c "
    set net:timeout 20
    set net:max-retries 2
    set sftp:auto-confirm yes
    set sftp:connect-program ssh -a -x -oBatchMode=yes
    open sftp://${TARGET}
    lcd ${LOCAL@Q}
    cd ${REMOTE}
    mirror -R -v --no-perms --no-umask \
      --exclude-glob .DS_Store \
      --exclude-glob Thumbs.db \
      --exclude-glob .git/ \
      ${del_flag[*]} \
      . .
    bye
  "
}

publish_lftp_site() {
  echo "==> lftp put index.html styles.css"
  lftp -c "
    set net:timeout 20
    set net:max-retries 2
    set sftp:auto-confirm yes
    set sftp:connect-program ssh -a -x -oBatchMode=yes
    open sftp://${TARGET}
    lcd ${LOCAL@Q}
    cd ${REMOTE}
    put index.html
    put styles.css
    bye
  "
}

# --- upload with OpenSSH sftp (works on SFTP-only accounts) ------------------

publish_sftp_all() {
  if [[ "$DELETE" -eq 1 ]]; then
    echo "error: --delete requires lftp (pacman -S lftp / apt install lftp)" >&2
    exit 1
  fi

  local batch name
  batch="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$batch'" EXIT

  {
    echo "cd ${REMOTE}"
    echo "lcd ${LOCAL}"

    while IFS= read -r -d '' f; do
      echo "put $(basename "$f")"
    done < <(find "$LOCAL" -maxdepth 1 -type f \
      ! -name '.DS_Store' ! -name 'Thumbs.db' -print0 | sort -z)

    while IFS= read -r -d '' d; do
      name="$(basename "$d")"
      echo "-mkdir ${name}"
      echo "put -R ${name}"
    done < <(find "$LOCAL" -mindepth 1 -maxdepth 1 -type d \
      ! -name '.git' -print0 | sort -z)
  } >"$batch"

  echo "==> sftp batch upload (full tree)"
  if [[ "${CALFNXT_SFTP_VERBOSE:-0}" == "1" ]]; then
    echo "---- batch ----"
    cat "$batch"
    echo "---------------"
  fi
  sftp -b "$batch" "$TARGET"
}

publish_sftp_site() {
  local batch
  batch="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$batch'" EXIT

  {
    echo "cd ${REMOTE}"
    echo "lcd ${LOCAL}"
    echo "put index.html"
    echo "put styles.css"
  } >"$batch"

  echo "==> sftp batch upload (index.html + styles.css)"
  if [[ "${CALFNXT_SFTP_VERBOSE:-0}" == "1" ]]; then
    echo "---- batch ----"
    cat "$batch"
    echo "---------------"
  fi
  sftp -b "$batch" "$TARGET"
}

do_publish() {
  local site_only="$1"
  need_website_dir
  need_sftp
  echo "==> local:  $LOCAL"
  echo "==> remote: sftp://${TARGET}/${REMOTE}"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    show_remote_plan
    return 0
  fi

  if command -v lftp >/dev/null 2>&1; then
    if [[ "$site_only" -eq 1 ]]; then
      publish_lftp_site
    else
      publish_lftp_all
    fi
  else
    if [[ "$site_only" -eq 1 ]]; then
      publish_sftp_site
    else
      publish_sftp_all
    fi
  fi

  echo "==> done: https://calfnxt.org/"
}

case "$CMD" in
  shots)
    generate_shots
    ;;
  publish)
    do_publish 0
    ;;
  all)
    generate_shots
    do_publish 0
    ;;
  site)
    do_publish 1
    ;;
esac
