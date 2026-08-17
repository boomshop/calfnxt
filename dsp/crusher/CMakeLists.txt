# Crusher — Calf-heritage bit / sample-rate reduction
set(target calfnxt-crusher)

set(CRUSHER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/crusher.plugin.json")
set(CRUSHER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/crusher_params.h")
set(CRUSHER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/crusherModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${CRUSHER_PARAMS_H}" "${CRUSHER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${CRUSHER_DESC}"
    --cpp-out "${CRUSHER_PARAMS_H}"
    --ts-out "${CRUSHER_MODEL_TS}"
    --namespace Crusher
  DEPENDS "${CRUSHER_DESC}" "${CODEGEN}"
  COMMENT "Codegen crusher plugin from descriptor"
  VERBATIM
)

add_custom_target(crusher_codegen DEPENDS "${CRUSHER_PARAMS_H}" "${CRUSHER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTCrusher"
  SOURCES_LIST
    source/crusher_dsp.h
    source/crusher_dsp.cpp
    source/crusher_entry.cpp
    source/version.h
    "${CRUSHER_PARAMS_H}"
)

add_dependencies(${target} crusher_codegen)

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

calfnxt_copy_plugin_ui(${target} crusher calfNXTCrusher)
calfnxt_copy_web_host(${target})
