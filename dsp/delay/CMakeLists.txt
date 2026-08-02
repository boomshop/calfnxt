# Delay — Calf heritage dual delay (Stereo / Ping-Pong / L-R / R-L)
set(target calfnxt-delay)

set(DELAY_DESC "${CMAKE_CURRENT_SOURCE_DIR}/delay.plugin.json")
set(DELAY_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/delay_params.h")
set(DELAY_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/delayModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${DELAY_PARAMS_H}" "${DELAY_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${DELAY_DESC}"
    --cpp-out "${DELAY_PARAMS_H}"
    --ts-out "${DELAY_MODEL_TS}"
    --namespace Delay
  DEPENDS "${DELAY_DESC}" "${CODEGEN}"
  COMMENT "Codegen delay plugin from descriptor"
  VERBATIM
)

add_custom_target(delay_codegen DEPENDS "${DELAY_PARAMS_H}" "${DELAY_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTDelay"
  SOURCES_LIST
    source/delay_dsp.h
    source/delay_dsp.cpp
    source/delay_entry.cpp
    source/version.h
    "${DELAY_PARAMS_H}"
)

add_dependencies(${target} delay_codegen)

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

calfnxt_copy_plugin_ui(${target} delay calfNXTDelay)
calfnxt_copy_web_host(${target})
