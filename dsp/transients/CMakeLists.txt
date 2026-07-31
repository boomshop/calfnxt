# Transients — Calf heritage transient shaper
set(target calfnxt-transients)

set(TRANSIENTS_DESC "${CMAKE_CURRENT_SOURCE_DIR}/transients.plugin.json")
set(TRANSIENTS_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/transients_params.h")
set(TRANSIENTS_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/transientsModel.ts")
set(PLUGINS_REGISTRY "${CMAKE_BINARY_DIR}/plugins.registry.json")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${TRANSIENTS_PARAMS_H}" "${TRANSIENTS_MODEL_TS}" "${PLUGINS_REGISTRY}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${TRANSIENTS_DESC}"
    --cpp-out "${TRANSIENTS_PARAMS_H}"
    --ts-out "${TRANSIENTS_MODEL_TS}"
    --registry-out "${PLUGINS_REGISTRY}"
    --namespace Transients
  DEPENDS "${TRANSIENTS_DESC}" "${CODEGEN}"
  COMMENT "Codegen transients plugin from descriptor"
  VERBATIM
)

add_custom_target(transients_codegen DEPENDS "${TRANSIENTS_PARAMS_H}" "${TRANSIENTS_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTTransients"
  SOURCES_LIST
    source/transients_dsp.h
    source/transients_dsp.cpp
    source/transients_entry.cpp
    source/version.h
    "${TRANSIENTS_PARAMS_H}"
)

add_dependencies(${target} transients_codegen)

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

calfnxt_copy_plugin_ui(${target} transients calfNXTTransients)
calfnxt_copy_web_host(${target})
