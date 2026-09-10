# Bender — delay-line pitch shift (no tracker)
set(target calfnxt-bender)

set(BENDER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/bender.plugin.json")
set(BENDER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/bender_params.h")
set(BENDER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/benderModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${BENDER_PARAMS_H}" "${BENDER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${BENDER_DESC}"
    --cpp-out "${BENDER_PARAMS_H}"
    --ts-out "${BENDER_MODEL_TS}"
    --namespace Bender
  DEPENDS "${BENDER_DESC}" "${CODEGEN}"
  COMMENT "Codegen bender plugin from descriptor"
  VERBATIM
)

add_custom_target(bender_codegen DEPENDS "${BENDER_PARAMS_H}" "${BENDER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTBender"
  SOURCES_LIST
    source/bender_dsp.h
    source/bender_dsp.cpp
    source/bender_entry.cpp
    source/version.h
    "${BENDER_PARAMS_H}"
)

add_dependencies(${target} bender_codegen)

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

calfnxt_copy_plugin_ui(${target} bender calfNXTBender)
calfnxt_copy_web_host(${target})
