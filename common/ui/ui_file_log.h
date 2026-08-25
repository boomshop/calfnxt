#pragma once

#include <cstdio>
#include <cstring>
#include <ctime>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

namespace calfNXT {
namespace Ui {

inline constexpr char kUiLogPath[] = "/tmp/calfnxt-ui.log";
/** Hard cap so a crash/evalJs loop cannot fill tmpfs. */
inline constexpr off_t kUiLogMaxBytes = 512 * 1024;

inline void writeUiLogLine(int fd, const char* line)
{
  if (fd < 0 || !line || !line[0])
    return;
  timespec now {};
  tm local {};
  char prefix[32];
  int n = 0;
  if (::clock_gettime(CLOCK_REALTIME, &now) == 0 && ::localtime_r(&now.tv_sec, &local) != nullptr)
  {
    n = std::snprintf(prefix, sizeof prefix, "%04d-%02d-%02d %02d:%02d:%02d.%06ld ",
                      local.tm_year + 1900, local.tm_mon + 1, local.tm_mday, local.tm_hour,
                      local.tm_min, local.tm_sec, static_cast<long>(now.tv_nsec / 1000));
  }
  if (n > 0)
    (void)::write(fd, prefix, static_cast<size_t>(n));
  (void)::write(fd, line, std::strlen(line));
}

/** Append one line; truncate the file when it already exceeds the cap. */
inline void appendUiLog(const char* line)
{
  if (!line || !line[0])
    return;
  const int fd = ::open(kUiLogPath, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
  if (fd < 0)
    return;
  const bool locked = (::flock(fd, LOCK_EX) == 0);
  struct stat st {};
  if (locked && ::fstat(fd, &st) == 0 && st.st_size >= kUiLogMaxBytes)
  {
    (void)::ftruncate(fd, 0);
    writeUiLogLine(fd, "[calfnxt] ui log reset (exceeded 512 KiB cap)\n");
  }
  writeUiLogLine(fd, line);
  if (locked)
    (void)::flock(fd, LOCK_UN);
  ::close(fd);
}

} // namespace Ui
} // namespace calfNXT
