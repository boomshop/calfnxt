# Flanger — Calf-heritage stereo flanger (delay comb + LFO)
set(target calfnxt-flanger)

set(FLANGER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/flanger.plugin.json")
set(FLANGER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/flanger_params.h")
set(FLANGER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/flangerModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${FLANGER_PARAMS_H}" "${FLANGER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${FLANGER_DESC}"
    --cpp-out "${FLANGER_PARAMS_H}"
    --ts-out "${FLANGER_MODEL_TS}"
    --namespace Flanger
  DEPENDS "${FLANGER_DESC}" "${CODEGEN}"
  COMMENT "Codegen flanger plugin from descriptor"
  VERBATIM
)

add_custom_target(flanger_codegen DEPENDS "${FLANGER_PARAMS_H}" "${FLANGER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTFlanger"
  SOURCES_LIST
    source/flanger_dsp.h
    source/flanger_dsp.cpp
    source/flanger_entry.cpp
    source/version.h
    "${FLANGER_PARAMS_H}"
)

add_dependencies(${target} flanger_codegen)

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

calfnxt_copy_plugin_ui(${target} flanger calfNXTFlanger)
calfnxt_copy_web_host(${target})
