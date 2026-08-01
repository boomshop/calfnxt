# Copy built .vst3 bundles into CALFNXT_VST3_DIR.
#
# Expected -D defines:
#   CALFNXT_BUNDLE_DIRS  — semicolon-separated absolute paths to *.vst3 roots
#   CALFNXT_BUNDLE_NAMES — semicolon-separated install names (e.g. calfNXTEqualizer)
# Destination (first match wins):
#   CALFNXT_VST3_DIR (-D) → env CALFNXT_VST3_DIR → CALFNXT_VST3_DIR_DEFAULT (-D)

if(NOT DEFINED CALFNXT_VST3_DIR OR CALFNXT_VST3_DIR STREQUAL "")
  if(DEFINED ENV{CALFNXT_VST3_DIR} AND NOT "$ENV{CALFNXT_VST3_DIR}" STREQUAL "")
    set(CALFNXT_VST3_DIR "$ENV{CALFNXT_VST3_DIR}")
  elseif(DEFINED CALFNXT_VST3_DIR_DEFAULT AND NOT CALFNXT_VST3_DIR_DEFAULT STREQUAL "")
    set(CALFNXT_VST3_DIR "${CALFNXT_VST3_DIR_DEFAULT}")
  endif()
endif()

if(NOT DEFINED CALFNXT_VST3_DIR OR CALFNXT_VST3_DIR STREQUAL "")
  message(FATAL_ERROR "copy_vst3_bundles.cmake: set CALFNXT_VST3_DIR or CALFNXT_VST3_DIR_DEFAULT")
endif()
if(NOT DEFINED CALFNXT_BUNDLE_DIRS OR NOT DEFINED CALFNXT_BUNDLE_NAMES)
  message(FATAL_ERROR "copy_vst3_bundles.cmake: need CALFNXT_BUNDLE_DIRS and CALFNXT_BUNDLE_NAMES")
endif()

list(LENGTH CALFNXT_BUNDLE_DIRS _n_dirs)
list(LENGTH CALFNXT_BUNDLE_NAMES _n_names)
if(NOT _n_dirs EQUAL _n_names)
  message(FATAL_ERROR "copy_vst3_bundles.cmake: dirs/names length mismatch (${_n_dirs} vs ${_n_names})")
endif()
if(_n_dirs EQUAL 0)
  message(FATAL_ERROR "copy_vst3_bundles.cmake: no bundles to install")
endif()

get_filename_component(CALFNXT_VST3_DIR "${CALFNXT_VST3_DIR}" ABSOLUTE)
file(MAKE_DIRECTORY "${CALFNXT_VST3_DIR}")

math(EXPR _last "${_n_dirs} - 1")
foreach(_i RANGE ${_last})
  list(GET CALFNXT_BUNDLE_DIRS ${_i} _src)
  list(GET CALFNXT_BUNDLE_NAMES ${_i} _name)
  get_filename_component(_src "${_src}" ABSOLUTE)
  set(_dst "${CALFNXT_VST3_DIR}/${_name}.vst3")
  if(NOT EXISTS "${_src}")
    message(FATAL_ERROR "copy_vst3_bundles.cmake: missing bundle ${_src} (build the plugin first)")
  endif()
  message(STATUS "calfnxt: install ${_name}.vst3 → ${_dst}")
  file(REMOVE_RECURSE "${_dst}")
  file(COPY "${_src}/" DESTINATION "${_dst}")
endforeach()
