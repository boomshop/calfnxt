# Invalidate SPA + per-plugin Resource embed stamps so the next build
# re-runs npm and copies fresh UI into VST3 Resources.
if(NOT DEFINED CALFNXT_UI_DIST_STAMP OR NOT DEFINED CALFNXT_BINARY_DIR)
  message(FATAL_ERROR "clear_ui_stamps.cmake needs CALFNXT_UI_DIST_STAMP and CALFNXT_BINARY_DIR")
endif()

file(REMOVE "${CALFNXT_UI_DIST_STAMP}")
file(GLOB _res_stamps "${CALFNXT_BINARY_DIR}/calfnxt-*.resources.stamp")
foreach(_s IN LISTS _res_stamps)
  file(REMOVE "${_s}")
endforeach()
message(STATUS "calfnxt: cleared UI + Resources stamps (force rebuild)")
