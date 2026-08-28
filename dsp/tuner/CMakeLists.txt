# Tuner — realtime pitch correction (linked stereo)
set(target calfnxt-tuner)

set(TUNER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/tuner.plugin.json")
set(TUNER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/tuner_params.h")
set(TUNER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/tunerModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${TUNER_PARAMS_H}" "${TUNER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${TUNER_DESC}"
    --cpp-out "${TUNER_PARAMS_H}"
    --ts-out "${TUNER_MODEL_TS}"
    --namespace Tuner
  DEPENDS "${TUNER_DESC}" "${CODEGEN}"
  COMMENT "Codegen tuner plugin from descriptor"
  VERBATIM
)

add_custom_target(tuner_codegen DEPENDS "${TUNER_PARAMS_H}" "${TUNER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTTuner"
  SOURCES_LIST
    source/tuner_dsp.h
    source/tuner_dsp.cpp
    source/tuner_entry.cpp
    source/version.h
    "${TUNER_PARAMS_H}"
)

add_dependencies(${target} tuner_codegen)

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

calfnxt_copy_plugin_ui(${target} tuner calfNXTTuner)
calfnxt_copy_web_host(${target})
