# DeEsser — sibilance / rumble control (Wide / Split, Ess / Rumble)
set(target calfnxt-deesser)

set(DEESSER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/deesser.plugin.json")
set(DEESSER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/deesser_params.h")
set(DEESSER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/deesserModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${DEESSER_PARAMS_H}" "${DEESSER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${DEESSER_DESC}"
    --cpp-out "${DEESSER_PARAMS_H}"
    --ts-out "${DEESSER_MODEL_TS}"
    --namespace Deesser
  DEPENDS "${DEESSER_DESC}" "${CODEGEN}"
  COMMENT "Codegen deesser plugin from descriptor"
  VERBATIM
)

add_custom_target(deesser_codegen DEPENDS "${DEESSER_PARAMS_H}" "${DEESSER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTDeesser"
  SOURCES_LIST
    source/deesser_dsp.h
    source/deesser_dsp.cpp
    source/deesser_entry.cpp
    source/version.h
    "${DEESSER_PARAMS_H}"
)

add_dependencies(${target} deesser_codegen)

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

calfnxt_copy_plugin_ui(${target} deesser calfNXTDeesser)
calfnxt_copy_web_host(${target})
