# Tamer — spectral resonance suppressor (STFT ↔ STFT)
set(target calfnxt-tamer)

set(TAMER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/tamer.plugin.json")
set(TAMER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/tamer_params.h")
set(TAMER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/tamerModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${TAMER_PARAMS_H}" "${TAMER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${TAMER_DESC}"
    --cpp-out "${TAMER_PARAMS_H}"
    --ts-out "${TAMER_MODEL_TS}"
    --namespace Tamer
  DEPENDS "${TAMER_DESC}" "${CODEGEN}"
  COMMENT "Codegen tamer plugin from descriptor"
  VERBATIM
)

add_custom_target(tamer_codegen DEPENDS "${TAMER_PARAMS_H}" "${TAMER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTTamer"
  SOURCES_LIST
    source/tamer_dsp.h
    source/tamer_dsp.cpp
    source/tamer_entry.cpp
    source/version.h
    "${TAMER_PARAMS_H}"
)

add_dependencies(${target} tamer_codegen)

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

calfnxt_copy_plugin_ui(${target} tamer calfNXTTamer)
calfnxt_copy_web_host(${target})
