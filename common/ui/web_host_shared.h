/**
 * Shared helpers for calfnxt-web-host (GTK3/XEmbed) and
 * calfnxt-web-host-gtk4 (floating GTK4/Wayland). No GTK/WebKit types here.
 */
#pragma once

#include "ui_file_log.h"
#include "viz_bin.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include <glib.h>

namespace calfNXT {
namespace Ui {
namespace WebHostShared {

bool envFlag(const char* name);
const char* envOrUnset(const char* name);

void hostLog(const char* fmt, ...) G_GNUC_PRINTF(1, 2);
void logEvalJsError(const char* message);

/**
 * Open http(s) in the desktop handler. Rejects other schemes and whitespace.
 * Returns false when the URL is refused or the launch fails.
 */
bool openExternalHttpUrl(const char* url);

/** True when `s` is `OPENURL\\n…` (consumed; does not forward to the plug-in). */
bool consumeUiCommand(const char* s);

/** Dup stderr → /tmp/calfnxt-ui.log (WebKit GBM warnings). Call before GTK init. */
void startStderrCapture();
bool stderrCaptureActive();

/** DRM / NVIDIA / env snapshot (no GDK). */
void logGraphicsProbe(const char* tag);

bool jsonHasType(const char* s, const char* type);
bool jsonNumberAfterKey(const char* s, const char* key, double& out);

/** Resolve calfnxt://bundle path → absolute file under webRoot. */
bool resolveBundlePath(const char* webRoot, const char* requestPath, char* outFull,
                       size_t outCap, std::string* outRel = nullptr);
const char* mimeForPath(const char* fullPath);

/** Injected at document-start; optional dump button when debug/inspector. */
std::string bridgeScriptSource(bool withDumpButton);

/** Pack one CNXV into the batch blob used by injectVizBinBatch JS. */
void appendVizPackItem(std::vector<std::uint8_t>& pack, const VizBin::Decoded& dec);

struct CliArgs
{
  int fd = -1;
  unsigned long parentXid = 0;
  char webRoot[4096] {};
  char entryHtml[256] {};
  int width = 360;
  int height = 420;
};

/** Parse --fd/--parent/--root/--entry/--width/--height. Returns 0 ok, 1 help, 2 error. */
int parseCli(int argc, char** argv, CliArgs& out, const char* argv0Label);

} // namespace WebHostShared
} // namespace Ui
} // namespace calfNXT
