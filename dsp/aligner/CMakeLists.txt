# Aligner — multi-mic delay align + stereo mix (8 mono → stereo + Reference aux)
set(target calfnxt-aligner)

set(ALIGNER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/aligner.plugin.json")
set(ALIGNER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/aligner_params.h")
set(ALIGNER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/alignerModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${ALIGNER_PARAMS_H}" "${ALIGNER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${ALIGNER_DESC}"
    --cpp-out "${ALIGNER_PARAMS_H}"
    --ts-out "${ALIGNER_MODEL_TS}"
    --namespace Aligner
  DEPENDS "${ALIGNER_DESC}" "${CODEGEN}"
  COMMENT "Codegen aligner plugin from descriptor"
  VERBATIM
)

add_custom_target(aligner_codegen DEPENDS "${ALIGNER_PARAMS_H}" "${ALIGNER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTAligner"
  SOURCES_LIST
    source/aligner_dsp.h
    source/aligner_dsp.cpp
    source/aligner_entry.cpp
    source/version.h
    "${ALIGNER_PARAMS_H}"
)

add_dependencies(${target} aligner_codegen)

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

calfnxt_copy_plugin_ui(${target} aligner calfNXTAligner)
calfnxt_copy_web_host(${target})
