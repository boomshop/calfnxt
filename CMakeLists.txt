cmake_minimum_required(VERSION 3.25)

# Lean: no SDK examples, no VSTGUI
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
# Avoid POST_BUILD rm/ln on ~/.vst3 (fails if the symlink is not writable).
set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)

project(calfnxt
  VERSION 0.1.1
  DESCRIPTION "calfNXT — VST3 + Web UI"
  LANGUAGES C CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(external/vst3sdk)

# Not visible from the SDK subdir — needed for linuxmain.cpp / smtg_target_add_library_main
set(SDK_ROOT "${CMAKE_SOURCE_DIR}/external/vst3sdk")
set(public_sdk_SOURCE_DIR "${SDK_ROOT}/public.sdk")

find_package(PkgConfig REQUIRED)
find_package(Python3 REQUIRED COMPONENTS Interpreter)
pkg_check_modules(GTK3 REQUIRED IMPORTED_TARGET gtk+-3.0)
pkg_check_modules(WEBKIT REQUIRED IMPORTED_TARGET webkit2gtk-4.1)

add_subdirectory(ui)
add_subdirectory(common/ui)
add_subdirectory(common/dsp)
add_subdirectory(dsp/equalizer)
add_subdirectory(dsp/stereo)
add_subdirectory(dsp/transients)
add_subdirectory(dsp/compressor)
add_subdirectory(dsp/deesser)

# After every plugin registered via calfnxt_copy_web_host: refresh helpers whenever
# calfnxt-web-host is rebuilt (plugin .so may be unchanged).
get_property(_calfnxt_web_host_plugins GLOBAL PROPERTY CALFNXT_WEB_HOST_PLUGIN_TARGETS)
set(_calfnxt_web_host_bundle_cmds)
foreach(_t IN LISTS _calfnxt_web_host_plugins)
  list(APPEND _calfnxt_web_host_bundle_cmds
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:${_t}>"
    COMMAND ${CMAKE_COMMAND} -E copy
      "$<TARGET_FILE:calfnxt-web-host>"
      "$<TARGET_FILE_DIR:${_t}>/calfnxt-web-host"
  )
endforeach()
add_custom_target(calfnxt-web-host-bundles
  ${_calfnxt_web_host_bundle_cmds}
  DEPENDS calfnxt-web-host
  COMMENT "Refresh calfnxt-web-host inside all plugin VST3 bundles"
)

# UI build needs generated models from every plugin descriptor
add_dependencies(calfnxt_web_ui equalizer_codegen stereo_codegen transients_codegen compressor_codegen deesser_codegen)

# Meta-target: all plugins + embedded UI packs (add new plugins here).
add_custom_target(calfnxt-plugins
  DEPENDS
    calfnxt-equalizer
    calfnxt-equalizer-resources
    calfnxt-stereo
    calfnxt-stereo-resources
    calfnxt-transients
    calfnxt-transients-resources
    calfnxt-compressor
    calfnxt-compressor-resources
    calfnxt-deesser
    calfnxt-deesser-resources
    calfnxt-web-host
    calfnxt-web-host-bundles
  COMMENT "Build all calfNXT VST3 plugins (+ embedded UI + web-host)"
)

# Install → ~/.vst3 for every plugin registered via calfnxt_copy_plugin_ui.
# Prefer ./tools/install-user-vst3.sh (clears stamps, rebuilds SPA, then this).
get_property(_calfnxt_install_targets GLOBAL PROPERTY CALFNXT_INSTALL_TARGETS)
get_property(_calfnxt_install_names GLOBAL PROPERTY CALFNXT_INSTALL_VST3_NAMES)
list(LENGTH _calfnxt_install_targets _calfnxt_install_n)
if(_calfnxt_install_n GREATER 0)
  set(_calfnxt_install_copy_cmds
    COMMAND ${CMAKE_COMMAND} -E make_directory "$ENV{HOME}/.vst3"
  )
  set(_calfnxt_install_copy_deps calfnxt-web-host calfnxt-web-host-bundles)
  set(_calfnxt_install_force_cmds
    COMMAND ${CMAKE_COMMAND}
      -DCALFNXT_UI_DIST_STAMP=${CALFNXT_UI_DIST_STAMP}
      -DCALFNXT_BINARY_DIR=${CMAKE_BINARY_DIR}
      -P "${CMAKE_SOURCE_DIR}/tools/cmake/clear_ui_stamps.cmake"
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target calfnxt_web_ui --parallel
  )
  set(_calfnxt_install_force_deps calfnxt-web-host)
  math(EXPR _calfnxt_install_last "${_calfnxt_install_n} - 1")
  foreach(_i RANGE ${_calfnxt_install_last})
    list(GET _calfnxt_install_targets ${_i} _t)
    list(GET _calfnxt_install_names ${_i} _name)
    list(APPEND _calfnxt_install_copy_cmds
      COMMAND ${CMAKE_COMMAND} -E rm -rf "$ENV{HOME}/.vst3/${_name}.vst3"
      COMMAND ${CMAKE_COMMAND} -E copy_directory
        "$<TARGET_FILE_DIR:${_t}>/../.."
        "$ENV{HOME}/.vst3/${_name}.vst3"
    )
    list(APPEND _calfnxt_install_copy_deps ${_t} ${_t}-resources)
    list(APPEND _calfnxt_install_force_cmds
      COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target ${_t}-resources --parallel
    )
    list(APPEND _calfnxt_install_force_deps ${_t})
  endforeach()
  list(APPEND _calfnxt_install_force_cmds
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target calfnxt-web-host-bundles --parallel
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target install-user-vst3-copy --parallel
  )

  add_custom_target(install-user-vst3-copy
    ${_calfnxt_install_copy_cmds}
    COMMENT "Install calfNXT plugins → ~/.vst3"
    DEPENDS ${_calfnxt_install_copy_deps}
  )
  add_custom_target(install-user-vst3
    ${_calfnxt_install_force_cmds}
    COMMENT "Force UI rebuild + install → ~/.vst3"
    DEPENDS ${_calfnxt_install_force_deps}
  )

  # For tools/install-user-vst3.sh: one resources target name per line.
  set(_calfnxt_res_list "")
  foreach(_t IN LISTS _calfnxt_install_targets)
    string(APPEND _calfnxt_res_list "${_t}-resources\n")
  endforeach()
  file(WRITE "${CMAKE_BINARY_DIR}/calfnxt-install-resources.txt" "${_calfnxt_res_list}")
endif()

message(STATUS "calfnxt: common/{ui,dsp} + dsp/{equalizer,stereo,transients,compressor,deesser} + shared ui/dist")
message(STATUS "calfnxt: build all plugins with --target calfnxt-plugins")
