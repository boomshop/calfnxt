# Shared React UI build (SPA → ui/dist; each VST3 embeds only its plugin pack)
find_program(NPM_EXECUTABLE npm)

set(CALFNXT_UI_DIST "${CMAKE_SOURCE_DIR}/ui/dist" CACHE PATH "Vite SPA UI output")
set(CALFNXT_UI_DIST_STAMP "${CALFNXT_UI_DIST}/.stamp")

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

if(NPM_EXECUTABLE)
  add_custom_command(
    OUTPUT "${CALFNXT_UI_DIST_STAMP}"
    COMMAND ${NPM_EXECUTABLE} install
    COMMAND ${NPM_EXECUTABLE} run build
    COMMAND ${CMAKE_COMMAND} -E touch "${CALFNXT_UI_DIST_STAMP}"
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/ui"
    DEPENDS ${CALFNXT_UI_SRC_DEPS}
    COMMENT "Build shared React UI → ui/dist (+ per-plugin packs)"
    VERBATIM
  )
  add_custom_target(calfnxt_web_ui DEPENDS "${CALFNXT_UI_DIST_STAMP}")
else()
  add_custom_target(calfnxt_web_ui)
  message(STATUS "npm not found — using existing ui/dist assets")
endif()

# Embed only this plugin's packed SPA into the VST3 Resources directory.
# Important: do NOT use POST_BUILD only — that skips the copy when the .so is
# already up to date after a UI-only change.
function(calfnxt_copy_plugin_ui target plugin_id)
  add_dependencies(${target} calfnxt_web_ui)

  set(res_stamp "${CMAKE_BINARY_DIR}/${target}.resources.stamp")
  set(plugin_dist "${CALFNXT_UI_DIST}/plugins/${plugin_id}")
  # Refresh SPA assets only — keep moduleinfo.json from moduleinfotool.
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
      "${CALFNXT_UI_DIST_STAMP}"
      ${target}
    COMMENT "Embed ${plugin_id} UI into ${target} Resources"
    VERBATIM
  )
  add_custom_target(${target}-resources ALL DEPENDS "${res_stamp}")
endfunction()
