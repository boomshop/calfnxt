cmake_minimum_required(VERSION 3.25)

# Lean: no SDK examples, no VSTGUI
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
# Avoid POST_BUILD rm/ln on ~/.vst3 (fails if the symlink is not writable).
set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)

project(calfnxt
  VERSION 0.1.0
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
add_dependencies(calfnxt_web_ui equalizer_codegen stereo_codegen transients_codegen compressor_codegen)

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
    calfnxt-web-host
    calfnxt-web-host-bundles
  COMMENT "Build all calfNXT VST3 plugins (+ embedded UI + web-host)"
)

message(STATUS "calfnxt: common/{ui,dsp} + dsp/{equalizer,stereo,transients,compressor} + shared ui/dist")
message(STATUS "calfnxt: build all plugins with --target calfnxt-plugins")
