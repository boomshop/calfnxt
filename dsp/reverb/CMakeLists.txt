# Reverb — algorithmic room (Calf late + ER + dynamics)
set(target calfnxt-reverb)

set(REVERB_DESC "${CMAKE_CURRENT_SOURCE_DIR}/reverb.plugin.json")
set(REVERB_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/reverb_params.h")
set(REVERB_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/reverbModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${REVERB_PARAMS_H}" "${REVERB_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${REVERB_DESC}"
    --cpp-out "${REVERB_PARAMS_H}"
    --ts-out "${REVERB_MODEL_TS}"
    --namespace Reverb
  DEPENDS "${REVERB_DESC}" "${CODEGEN}"
  COMMENT "Codegen reverb plugin from descriptor"
  VERBATIM
)

add_custom_target(reverb_codegen DEPENDS "${REVERB_PARAMS_H}" "${REVERB_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTReverb"
  SOURCES_LIST
    source/reverb_dsp.h
    source/reverb_dsp.cpp
    source/reverb_entry.cpp
    source/version.h
    "${REVERB_PARAMS_H}"
)

add_dependencies(${target} reverb_codegen)

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

calfnxt_copy_plugin_ui(${target} reverb calfNXTReverb)
calfnxt_copy_web_host(${target})
