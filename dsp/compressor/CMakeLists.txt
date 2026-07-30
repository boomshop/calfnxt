# Compressor — Calf heritage feed-forward dynamics
set(target calfnxt-compressor)

set(COMPRESSOR_DESC "${CMAKE_CURRENT_SOURCE_DIR}/compressor.plugin.json")
set(COMPRESSOR_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/compressor_params.h")
set(COMPRESSOR_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/compressorModel.ts")
set(PLUGINS_REGISTRY "${CMAKE_BINARY_DIR}/plugins.registry.json")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${COMPRESSOR_PARAMS_H}" "${COMPRESSOR_MODEL_TS}" "${PLUGINS_REGISTRY}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${COMPRESSOR_DESC}"
    --cpp-out "${COMPRESSOR_PARAMS_H}"
    --ts-out "${COMPRESSOR_MODEL_TS}"
    --registry-out "${PLUGINS_REGISTRY}"
    --namespace Compressor
  DEPENDS "${COMPRESSOR_DESC}" "${CODEGEN}"
  COMMENT "Codegen compressor plugin from descriptor"
  VERBATIM
)

add_custom_target(compressor_codegen DEPENDS "${COMPRESSOR_PARAMS_H}" "${COMPRESSOR_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTCompressor"
  SOURCES_LIST
    source/compressor_dsp.h
    source/compressor_dsp.cpp
    source/compressor_entry.cpp
    source/version.h
    "${COMPRESSOR_PARAMS_H}"
)

add_dependencies(${target} compressor_codegen)

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

calfnxt_copy_plugin_ui(${target} compressor)
calfnxt_copy_web_host(${target})
