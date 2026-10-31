# Shared UI: VST3 editor proxy (no GTK) + out-of-process web-host binaries

add_library(calfnxt_ui STATIC
  web_editor.cpp
  web_editor.h
  viz_source.h
  viz_hz.cpp
  viz_hz.h
)

target_include_directories(calfnxt_ui
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
  PRIVATE
    ${CMAKE_SOURCE_DIR}/external/vst3sdk
)

# Plugin .so must not pull GTK/WebKit (Ardour GType conflict).
# X11 is OK: parent-visibility poll for helper respawn after quit-on-hide.
find_package(X11 REQUIRED)
target_link_libraries(calfnxt_ui
  PUBLIC
    sdk
    ${CMAKE_DL_LIBS}
  PRIVATE
    X11::X11
)

target_compile_features(calfnxt_ui PUBLIC cxx_std_17)
set_target_properties(calfnxt_ui PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(SMTG_LINUX)
  target_compile_definitions(calfnxt_ui PUBLIC CALFNXT_LINUX=1)
endif()

# Out-of-process helpers (GTK/WebKit only here — never on calfnxt_ui / plugin .so).
find_package(PkgConfig REQUIRED)
pkg_check_modules(GTK3 REQUIRED IMPORTED_TARGET gtk+-3.0)
pkg_check_modules(WEBKIT REQUIRED IMPORTED_TARGET webkit2gtk-4.1)

# Optional floating GTK4 + webkitgtk-6.0 helper (CALFNXT_WEB_HOST=gtk4).
option(CALFNXT_WEB_HOST_GTK4 "Build calfnxt-web-host-gtk4 (floating GTK4/Wayland)" ON)
set(CALFNXT_HAVE_WEB_HOST_GTK4 OFF)
if(CALFNXT_WEB_HOST_GTK4)
  pkg_check_modules(GTK4 IMPORTED_TARGET gtk4)
  pkg_check_modules(WEBKITGTK6 IMPORTED_TARGET webkitgtk-6.0)
  if(GTK4_FOUND AND WEBKITGTK6_FOUND)
    set(CALFNXT_HAVE_WEB_HOST_GTK4 ON)
  else()
    message(STATUS "calfnxt: webkitgtk-6.0/gtk4 not found — skipping calfnxt-web-host-gtk4")
  endif()
endif()
# Visible to root CMakeLists (web-host-bundles).
set(CALFNXT_HAVE_WEB_HOST_GTK4 "${CALFNXT_HAVE_WEB_HOST_GTK4}" PARENT_SCOPE)

add_executable(calfnxt-web-host
  web_host_main.cpp
  web_host_shared.cpp
)

target_include_directories(calfnxt-web-host PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(calfnxt-web-host
  PRIVATE
    PkgConfig::GTK3
    PkgConfig::WEBKIT
    X11
)

target_compile_features(calfnxt-web-host PRIVATE cxx_std_17)

if(CALFNXT_HAVE_WEB_HOST_GTK4)
  add_executable(calfnxt-web-host-gtk4
    web_host_gtk4_main.cpp
    web_host_shared.cpp
  )
  target_include_directories(calfnxt-web-host-gtk4 PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
  )
  target_link_libraries(calfnxt-web-host-gtk4
    PRIVATE
      PkgConfig::GTK4
      PkgConfig::WEBKITGTK6
      X11
  )
  target_compile_features(calfnxt-web-host-gtk4 PRIVATE cxx_std_17)
  target_compile_definitions(calfnxt_ui PUBLIC CALFNXT_HAVE_WEB_HOST_GTK4=1)
endif()

# Copy helper(s) next to each plugin .so (Contents/<arch>/).
# Plugin POST_BUILD alone is not enough: rebuilding only the helper leaves
# stale copies in build/VST3/…, and install-user-vst3 then overwrites ~/.vst3.
# Root CMakeLists creates calfnxt-web-host-bundles from CALFNXT_WEB_HOST_PLUGIN_TARGETS.
function(calfnxt_copy_web_host target)
  add_custom_command(
    TARGET ${target} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
      "$<TARGET_FILE:calfnxt-web-host>"
      "$<TARGET_FILE_DIR:${target}>/calfnxt-web-host"
    COMMENT "Copy calfnxt-web-host next to ${target}"
    VERBATIM
  )
  add_dependencies(${target} calfnxt-web-host)
  if(CALFNXT_HAVE_WEB_HOST_GTK4)
    add_custom_command(
      TARGET ${target} POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy
        "$<TARGET_FILE:calfnxt-web-host-gtk4>"
        "$<TARGET_FILE_DIR:${target}>/calfnxt-web-host-gtk4"
      COMMENT "Copy calfnxt-web-host-gtk4 next to ${target}"
      VERBATIM
    )
    add_dependencies(${target} calfnxt-web-host-gtk4)
  endif()
  set_property(GLOBAL APPEND PROPERTY CALFNXT_WEB_HOST_PLUGIN_TARGETS "${target}")
endfunction()
