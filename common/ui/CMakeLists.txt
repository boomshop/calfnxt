# Shared UI: VST3 editor proxy (no GTK) + out-of-process web-host binary

add_library(calfnxt_ui STATIC
  web_editor.cpp
  web_editor.h
  viz_source.h
)

target_include_directories(calfnxt_ui
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
  PRIVATE
    ${CMAKE_SOURCE_DIR}/external/vst3sdk
)

# Plugin .so must not pull GTK/WebKit (Ardour GType conflict).
target_link_libraries(calfnxt_ui
  PUBLIC
    sdk
    ${CMAKE_DL_LIBS}
)

target_compile_features(calfnxt_ui PUBLIC cxx_std_17)
set_target_properties(calfnxt_ui PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(SMTG_LINUX)
  target_compile_definitions(calfnxt_ui PUBLIC CALFNXT_LINUX=1)
endif()

# Out-of-process GtkPlug + WebKitGTK helper (XEmbed into host parent XID).
add_executable(calfnxt-web-host
  web_host_main.cpp
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

# Copy helper next to each plugin .so (Contents/<arch>/calfnxt-web-host).
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
endfunction()
