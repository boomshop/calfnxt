#pragma once

// Recursively collect WAV/AIFF files under a library root into a compact JSON tree.

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

namespace calfNXT {
namespace Dsp {

inline void jsonEscapeAppend(std::string& out, const std::string& in)
{
  out.push_back('"');
  for (unsigned char c : in)
  {
    switch (c)
    {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (c < 0x20)
        {
          char buf[8];
          std::snprintf(buf, sizeof buf, "\\u%04x", c);
          out += buf;
        }
        else
          out.push_back(static_cast<char>(c));
        break;
    }
  }
  out.push_back('"');
}

inline bool isIrAudioName(const std::string& name)
{
  auto lower = name;
  std::transform(lower.begin(), lower.end(), lower.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  const auto has = [&](const char* ext, size_t n) {
    return lower.size() >= n && lower.compare(lower.size() - n, n, ext) == 0;
  };
  return has(".wav", 4) || has(".wave", 5) || has(".aif", 4) || has(".aiff", 5)
         || has(".aifc", 5);
}

inline bool isHiddenName(const std::string& name)
{
  return name.empty() || name[0] == '.';
}

struct IrDirNode
{
  std::string name;
  std::string rel; // files only
  bool dir = false;
  std::vector<IrDirNode> kids;
};

inline bool buildIrSubtree(const std::filesystem::path& abs, const std::filesystem::path& root,
                           IrDirNode& node, int depth, int& fileCount, int maxFiles)
{
  namespace fs = std::filesystem;
  if (depth > 12 || fileCount >= maxFiles)
    return false;
  std::error_code ec;
  std::vector<fs::directory_entry> ents;
  for (fs::directory_iterator it(abs, fs::directory_options::skip_permission_denied, ec);
       it != fs::directory_iterator(); ++it)
  {
    if (ec)
      break;
    ents.push_back(*it);
  }
  std::sort(ents.begin(), ents.end(), [](const fs::directory_entry& a, const fs::directory_entry& b) {
    const auto na = a.path().filename().string();
    const auto nb = b.path().filename().string();
    const bool da = a.is_directory();
    const bool db = b.is_directory();
    if (da != db)
      return da && !db;
    return na < nb;
  });

  bool any = false;
  for (const auto& e : ents)
  {
    if (fileCount >= maxFiles)
      break;
    std::error_code lec;
    const auto name = e.path().filename().string();
    if (isHiddenName(name) || e.is_symlink(lec))
      continue;
    if (e.is_directory(lec))
    {
      IrDirNode kid;
      kid.name = name;
      kid.dir = true;
      if (buildIrSubtree(e.path(), root, kid, depth + 1, fileCount, maxFiles) && !kid.kids.empty())
      {
        node.kids.push_back(std::move(kid));
        any = true;
      }
    }
    else if (e.is_regular_file(lec) && isIrAudioName(name))
    {
      IrDirNode kid;
      kid.name = name;
      kid.dir = false;
      std::error_code rec;
      auto rel = fs::relative(e.path(), root, rec);
      kid.rel = rec ? e.path().string() : rel.generic_string();
      node.kids.push_back(std::move(kid));
      ++fileCount;
      any = true;
    }
  }
  return any;
}

inline void appendIrNodeJson(std::string& out, const IrDirNode& n)
{
  out += "{\"n\":";
  jsonEscapeAppend(out, n.name);
  if (n.dir)
  {
    out += ",\"d\":1,\"c\":[";
    for (size_t i = 0; i < n.kids.size(); ++i)
    {
      if (i)
        out += ',';
      appendIrNodeJson(out, n.kids[i]);
    }
    out += "]}";
  }
  else
  {
    out += ",\"p\":";
    jsonEscapeAppend(out, n.rel);
    out += '}';
  }
}

/** Returns JSON array of top-level nodes. Empty string on failure. */
inline std::string scanIrLibraryJson(const std::string& rootPath, int maxFiles, int& fileCount,
                                     std::string& err)
{
  namespace fs = std::filesystem;
  fileCount = 0;
  err.clear();
  std::error_code ec;
  fs::path root(rootPath);
  if (!fs::is_directory(root, ec))
  {
    err = "not a directory";
    return "[]";
  }
  IrDirNode dummy;
  dummy.dir = true;
  buildIrSubtree(root, root, dummy, 0, fileCount, maxFiles);
  std::string out = "[";
  for (size_t i = 0; i < dummy.kids.size(); ++i)
  {
    if (i)
      out += ',';
    appendIrNodeJson(out, dummy.kids[i]);
  }
  out += ']';
  return out;
}

} // namespace Dsp
} // namespace calfNXT
