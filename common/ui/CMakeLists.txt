# Shared UI base (WebKit VST3 editor)
add_library(calfnxt_ui STATIC
  web_editor.cpp
  web_editor.h
)

target_include_directories(calfnxt_ui
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
  PRIVATE
    ${CMAKE_SOURCE_DIR}/external/vst3sdk
)

target_link_libraries(calfnxt_ui
  PUBLIC
    sdk
    PkgConfig::GTK3
    PkgConfig::WEBKIT
    X11
    ${CMAKE_DL_LIBS}
)

target_compile_features(calfnxt_ui PUBLIC cxx_std_17)
set_target_properties(calfnxt_ui PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(SMTG_LINUX)
  target_compile_definitions(calfnxt_ui PUBLIC CALFNXT_LINUX=1)
endif()
