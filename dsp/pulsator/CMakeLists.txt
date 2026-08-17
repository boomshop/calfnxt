# Pulsator — Calf-heritage stereo tremolo / autopanner
set(target calfnxt-pulsator)

set(PULSATOR_DESC "${CMAKE_CURRENT_SOURCE_DIR}/pulsator.plugin.json")
set(PULSATOR_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/pulsator_params.h")
set(PULSATOR_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/pulsatorModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${PULSATOR_PARAMS_H}" "${PULSATOR_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${PULSATOR_DESC}"
    --cpp-out "${PULSATOR_PARAMS_H}"
    --ts-out "${PULSATOR_MODEL_TS}"
    --namespace Pulsator
  DEPENDS "${PULSATOR_DESC}" "${CODEGEN}"
  COMMENT "Codegen pulsator plugin from descriptor"
  VERBATIM
)

add_custom_target(pulsator_codegen DEPENDS "${PULSATOR_PARAMS_H}" "${PULSATOR_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTPulsator"
  SOURCES_LIST
    source/pulsator_dsp.h
    source/pulsator_dsp.cpp
    source/pulsator_entry.cpp
    source/version.h
    "${PULSATOR_PARAMS_H}"
)

add_dependencies(${target} pulsator_codegen)

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

calfnxt_copy_plugin_ui(${target} pulsator calfNXTPulsator)
calfnxt_copy_web_host(${target})
