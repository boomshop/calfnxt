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

# UI build needs generated models from every plugin descriptor
add_dependencies(calfnxt_web_ui equalizer_codegen stereo_codegen)

message(STATUS "calfnxt: common/{ui,dsp} + dsp/{equalizer,stereo} + shared ui/dist")
