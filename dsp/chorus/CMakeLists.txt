# Chorus — Calf Multi Chorus (multi-tap delay, no feedback)
set(target calfnxt-chorus)

set(CHORUS_DESC "${CMAKE_CURRENT_SOURCE_DIR}/chorus.plugin.json")
set(CHORUS_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/chorus_params.h")
set(CHORUS_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/chorusModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${CHORUS_PARAMS_H}" "${CHORUS_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${CHORUS_DESC}"
    --cpp-out "${CHORUS_PARAMS_H}"
    --ts-out "${CHORUS_MODEL_TS}"
    --namespace Chorus
  DEPENDS "${CHORUS_DESC}" "${CODEGEN}"
  COMMENT "Codegen chorus plugin from descriptor"
  VERBATIM
)

add_custom_target(chorus_codegen DEPENDS "${CHORUS_PARAMS_H}" "${CHORUS_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTChorus"
  SOURCES_LIST
    source/chorus_dsp.h
    source/chorus_dsp.cpp
    source/chorus_entry.cpp
    source/version.h
    "${CHORUS_PARAMS_H}"
)

add_dependencies(${target} chorus_codegen)

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

calfnxt_copy_plugin_ui(${target} chorus calfNXTChorus)
calfnxt_copy_web_host(${target})
