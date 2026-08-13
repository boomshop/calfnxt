# Harmonics — saturator / exciter / bass enhancer (Calf heritage)
set(target calfnxt-harmonics)

set(HARMONICS_DESC "${CMAKE_CURRENT_SOURCE_DIR}/harmonics.plugin.json")
set(HARMONICS_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/harmonics_params.h")
set(HARMONICS_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/harmonicsModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${HARMONICS_PARAMS_H}" "${HARMONICS_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${HARMONICS_DESC}"
    --cpp-out "${HARMONICS_PARAMS_H}"
    --ts-out "${HARMONICS_MODEL_TS}"
    --namespace Harmonics
  DEPENDS "${HARMONICS_DESC}" "${CODEGEN}"
  COMMENT "Codegen harmonics plugin from descriptor"
  VERBATIM
)

add_custom_target(harmonics_codegen DEPENDS "${HARMONICS_PARAMS_H}" "${HARMONICS_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTHarmonics"
  SOURCES_LIST
    source/harmonics_dsp.h
    source/harmonics_dsp.cpp
    source/harmonics_entry.cpp
    source/version.h
    "${HARMONICS_PARAMS_H}"
)

add_dependencies(${target} harmonics_codegen)

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

calfnxt_copy_plugin_ui(${target} harmonics calfNXTHarmonics)
calfnxt_copy_web_host(${target})
