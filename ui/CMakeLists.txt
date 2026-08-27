# Shared React UI build (SPA → ui/dist; each VST3 embeds only its plugin pack)
find_program(NPM_EXECUTABLE npm)

option(CALFNXT_USE_PREBUILT_UI
  "Use existing ui/dist (skip npm). For distro builds with a ui-dist source tarball."
  OFF)

set(CALFNXT_UI_DIST "${CMAKE_SOURCE_DIR}/ui/dist" CACHE PATH "Vite SPA UI output")
# Must be visible to sibling dirs (e.g. install-user-vst3 in root CMakeLists).
set(CALFNXT_UI_DIST_STAMP "${CALFNXT_UI_DIST}/.stamp" CACHE INTERNAL "SPA build stamp path")

# Track UI sources via glob so new/edited files invalidate the SPA stamp without
# maintaining a brittle hand-written DEPENDS list.
file(GLOB_RECURSE CALFNXT_UI_SRC_DEPS CONFIGURE_DEPENDS
  "${CMAKE_SOURCE_DIR}/ui/src/*"
  "${CMAKE_SOURCE_DIR}/ui/scripts/*"
)
list(APPEND CALFNXT_UI_SRC_DEPS
  "${CMAKE_SOURCE_DIR}/ui/package.json"
  "${CMAKE_SOURCE_DIR}/ui/package-lock.json"
  "${CMAKE_SOURCE_DIR}/ui/vite.config.ts"
  "${CMAKE_SOURCE_DIR}/ui/index.html"
  "${CMAKE_SOURCE_DIR}/ui/tsconfig.json"
)
# Visible from calfnxt_copy_plugin_ui() when called in plugin subdirs.
set_property(GLOBAL PROPERTY CALFNXT_UI_SRC_DEPS "${CALFNXT_UI_SRC_DEPS}")

if(CALFNXT_USE_PREBUILT_UI)
  if(NOT EXISTS "${CALFNXT_UI_DIST_STAMP}")
    message(FATAL_ERROR
      "CALFNXT_USE_PREBUILT_UI=ON but missing ${CALFNXT_UI_DIST_STAMP}.\n"
      "  Unpack the release ui-dist tarball so ui/dist/ exists (including .stamp), then reconfigure.")
  endif()
  if(NOT EXISTS "${CALFNXT_UI_DIST}/plugins")
    message(FATAL_ERROR
      "CALFNXT_USE_PREBUILT_UI=ON but missing ${CALFNXT_UI_DIST}/plugins/.\n"
      "  Unpack calfnxt-*-ui-dist.tar.xz into the source tree (creates ui/dist/).")
  endif()
  add_custom_target(calfnxt_web_ui)
  message(STATUS "calfnxt: using prebuilt UI from ${CALFNXT_UI_DIST}")
elseif(NPM_EXECUTABLE)
  # Offline-friendly: if node_modules is already present (vendored or prior
  # install), only run the Vite build — no registry access.
  if(EXISTS "${CMAKE_SOURCE_DIR}/ui/node_modules")
    set(_calfnxt_ui_npm_cmds
      COMMAND ${NPM_EXECUTABLE} run build
    )
    set(_calfnxt_ui_npm_comment "Build shared React UI → ui/dist (npm run build, existing node_modules)")
  else()
    set(_calfnxt_ui_npm_cmds
      COMMAND ${NPM_EXECUTABLE} ci
      COMMAND ${NPM_EXECUTABLE} run build
    )
    set(_calfnxt_ui_npm_comment "Build shared React UI → ui/dist (npm ci + build)")
  endif()
  add_custom_command(
    OUTPUT "${CALFNXT_UI_DIST_STAMP}"
    ${_calfnxt_ui_npm_cmds}
    COMMAND ${CMAKE_COMMAND} -E touch "${CALFNXT_UI_DIST_STAMP}"
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/ui"
    DEPENDS ${CALFNXT_UI_SRC_DEPS}
    COMMENT "${_calfnxt_ui_npm_comment}"
    VERBATIM
  )
  add_custom_target(calfnxt_web_ui DEPENDS "${CALFNXT_UI_DIST_STAMP}")
else()
  if(NOT EXISTS "${CALFNXT_UI_DIST_STAMP}" OR NOT EXISTS "${CALFNXT_UI_DIST}/plugins")
    message(FATAL_ERROR
      "npm not found and ${CALFNXT_UI_DIST}/.stamp is missing.\n"
      "  Install Node.js/npm, or unpack calfnxt-*-ui-dist.tar.xz at the source\n"
      "  tree root and reconfigure with -DCALFNXT_USE_PREBUILT_UI=ON.")
  endif()
  add_custom_target(calfnxt_web_ui)
  message(STATUS "npm not found — using existing ui/dist assets")
endif()

# Embed only this plugin's packed SPA into the VST3 Resources directory.
# Important: do NOT use POST_BUILD only — that skips the copy when the .so is
# already up to date after a UI-only change.
#
# vst3_dirname: ~/.vst3/<name>.vst3 (e.g. calfNXTEqualizer). Registers the
# plugin for install-user-vst3-copy (root CMakeLists, after all plugin subdirs).
function(calfnxt_copy_plugin_ui target plugin_id vst3_dirname)
  add_dependencies(${target} calfnxt_web_ui)

  set(res_stamp "${CMAKE_BINARY_DIR}/${target}.resources.stamp")
  set(plugin_dist "${CALFNXT_UI_DIST}/plugins/${plugin_id}")
  get_property(_ui_src_deps GLOBAL PROPERTY CALFNXT_UI_SRC_DEPS)
  # Refresh SPA assets only — keep moduleinfo.json from moduleinfotool.
  #
  # Do NOT DEPENDS on ${CALFNXT_UI_DIST_STAMP}: that OUTPUT rule lives in ui/
  # only. Unix Makefiles then fail on a fresh clone with
  # "No rule to make target ui/dist/.stamp" because the file is not in git.
  # Order comes from target calfnxt_web_ui; UI-source files (in git) invalidate
  # the embed after a SPA-only edit.
  add_custom_command(
    OUTPUT "${res_stamp}"
    COMMAND ${CMAKE_COMMAND} -E rm -rf
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E make_directory
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
      "${plugin_dist}/assets"
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E copy
      "${plugin_dist}/index.html"
      "$<TARGET_FILE_DIR:${target}>/../Resources/index.html"
    COMMAND ${CMAKE_COMMAND} -E touch "${res_stamp}"
    DEPENDS
      calfnxt_web_ui
      ${target}
      ${_ui_src_deps}
    COMMENT "Embed ${plugin_id} UI into ${target} Resources"
    VERBATIM
  )
  add_custom_target(${target}-resources ALL DEPENDS "${res_stamp}")
  add_dependencies(${target}-resources calfnxt_web_ui)

  set_property(GLOBAL APPEND PROPERTY CALFNXT_INSTALL_TARGETS "${target}")
  set_property(GLOBAL APPEND PROPERTY CALFNXT_INSTALL_VST3_NAMES "${vst3_dirname}")
endfunction()
