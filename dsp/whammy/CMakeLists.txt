# Whammy — delay-line pitch shift (no tracker)
set(target calfnxt-whammy)

set(WHAMMY_DESC "${CMAKE_CURRENT_SOURCE_DIR}/whammy.plugin.json")
set(WHAMMY_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/whammy_params.h")
set(WHAMMY_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/whammyModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${WHAMMY_PARAMS_H}" "${WHAMMY_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${WHAMMY_DESC}"
    --cpp-out "${WHAMMY_PARAMS_H}"
    --ts-out "${WHAMMY_MODEL_TS}"
    --namespace Whammy
  DEPENDS "${WHAMMY_DESC}" "${CODEGEN}"
  COMMENT "Codegen whammy plugin from descriptor"
  VERBATIM
)

add_custom_target(whammy_codegen DEPENDS "${WHAMMY_PARAMS_H}" "${WHAMMY_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTWhammy"
  SOURCES_LIST
    source/whammy_dsp.h
    source/whammy_dsp.cpp
    source/whammy_entry.cpp
    source/version.h
    "${WHAMMY_PARAMS_H}"
)

add_dependencies(${target} whammy_codegen)

smtg_target_configure_version_file(${target})

target_include_directories(${target} PRIVATE
  source
  ${CMAKE_CURRENT_BINARY_DIR}
  ${CMAKE_CURRENT_BINARY_DIR}/generated
)

target_link_libraries(${target}
  PRIVATE
    calfnxt_dsp
)

target_compile_features(${target} PUBLIC cxx_std_17)

calfnxt_copy_plugin_ui(${target} whammy calfNXTWhammy)
calfnxt_copy_web_host(${target})
