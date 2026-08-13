# Limiter — Calf heritage lookahead brickwall
set(target calfnxt-limiter)

set(LIMITER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/limiter.plugin.json")
set(LIMITER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/limiter_params.h")
set(LIMITER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/limiterModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${LIMITER_PARAMS_H}" "${LIMITER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${LIMITER_DESC}"
    --cpp-out "${LIMITER_PARAMS_H}"
    --ts-out "${LIMITER_MODEL_TS}"
    --namespace Limiter
  DEPENDS "${LIMITER_DESC}" "${CODEGEN}"
  COMMENT "Codegen limiter plugin from descriptor"
  VERBATIM
)

add_custom_target(limiter_codegen DEPENDS "${LIMITER_PARAMS_H}" "${LIMITER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTLimiter"
  SOURCES_LIST
    source/limiter_dsp.h
    source/limiter_dsp.cpp
    source/limiter_entry.cpp
    source/version.h
    "${LIMITER_PARAMS_H}"
)

add_dependencies(${target} limiter_codegen)

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

calfnxt_copy_plugin_ui(${target} limiter calfNXTLimiter)
calfnxt_copy_web_host(${target})
