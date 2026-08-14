# Analyzer — spectrum + stereo field monitor (passthrough)
set(target calfnxt-analyzer)

set(ANALYZER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/analyzer.plugin.json")
set(ANALYZER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/analyzer_params.h")
set(ANALYZER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/analyzerModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${ANALYZER_PARAMS_H}" "${ANALYZER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${ANALYZER_DESC}"
    --cpp-out "${ANALYZER_PARAMS_H}"
    --ts-out "${ANALYZER_MODEL_TS}"
    --namespace Analyzer
  DEPENDS "${ANALYZER_DESC}" "${CODEGEN}"
  COMMENT "Codegen analyzer plugin from descriptor"
  VERBATIM
)

add_custom_target(analyzer_codegen DEPENDS "${ANALYZER_PARAMS_H}" "${ANALYZER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTAnalyzer"
  SOURCES_LIST
    source/analyzer_dsp.h
    source/analyzer_dsp.cpp
    source/analyzer_entry.cpp
    source/version.h
    "${ANALYZER_PARAMS_H}"
)

add_dependencies(${target} analyzer_codegen)

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

calfnxt_copy_plugin_ui(${target} analyzer calfNXTAnalyzer)
calfnxt_copy_web_host(${target})
