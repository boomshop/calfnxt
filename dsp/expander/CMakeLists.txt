# Expander — Calf Gate / Sidechain Gate heritage (downward expansion)
set(target calfnxt-expander)

set(EXPANDER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/expander.plugin.json")
set(EXPANDER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/expander_params.h")
set(EXPANDER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/expanderModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${EXPANDER_PARAMS_H}" "${EXPANDER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${EXPANDER_DESC}"
    --cpp-out "${EXPANDER_PARAMS_H}"
    --ts-out "${EXPANDER_MODEL_TS}"
    --namespace Expander
  DEPENDS "${EXPANDER_DESC}" "${CODEGEN}"
  COMMENT "Codegen expander plugin from descriptor"
  VERBATIM
)

add_custom_target(expander_codegen DEPENDS "${EXPANDER_PARAMS_H}" "${EXPANDER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTExpander"
  SOURCES_LIST
    source/expander_dsp.h
    source/expander_dsp.cpp
    source/expander_entry.cpp
    source/version.h
    "${EXPANDER_PARAMS_H}"
)

add_dependencies(${target} expander_codegen)

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

calfnxt_copy_plugin_ui(${target} expander calfNXTExpander)
calfnxt_copy_web_host(${target})
