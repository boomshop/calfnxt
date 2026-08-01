# Versioning

calfNXT uses **suite-wide Semantic Versioning** (`MAJOR.MINOR.PATCH`).
One version applies to the CMake project, every `dsp/*/*.plugin.json`, and `ui/package.json`.

Git tags are `vMAJOR.MINOR.PATCH` (example: `v0.1.0`).

See also [`tools/release.sh`](tools/release.sh) for cutting a release.

## When to bump

| Bump | Pattern | Use when |
|------|---------|----------|
| **Patch** | `X.Y.Z` → `X.Y.Z+1` | Bugfixes, hotfixes, docs, build fixes with no new user-facing feature; no new plugins; no intentional preset/bridge breaks |
| **Minor** | `X.Y.Z` → `X.Y+1.0` | New plugin; new feature (UI or DSP); backward-compatible parameter additions |
| **Major** | `X.Y.Z` → `X+1.0.0` | Breaking change: removed/renamed parameters, incompatible bridge messages, presets/state no longer loadable, intentionally incompatible host behavior |

## Extra rules

- **Until 1.0.0** the stability promise is soft: clear breaks *may* ship as a **Minor** bump if a Major jump feels premature. From **1.0.0** onward, treat the table above strictly.
- Per-plugin DSP **`kStateVersion`** (chunk format) is **not** the suite SemVer. A state-format break must be called out in release notes and should bump at least **Minor** (from 1.0.0: **Major**).
- All plugin `"version"` fields and `project(calfnxt VERSION …)` must stay **equal** to the suite version.

## Release artifacts (not in git)

`tools/release.sh` publishes GitHub Release assets (not committed to the repo):

- `calfnxt-X.Y.Z-ui-dist.tar.xz` — prebuilt `ui/dist` for offline/distro builds
- matching `.sha256`
- optional source archive from the tag

Distros fetch these as fixed `SourceN` entries (checksummed), then build **without** network / without `npm`. See the packaging section in [`README.md`](README.md).
