# Multiband Limiter — LR split + weighted strip limiters + final broadband
set(target calfnxt-mblimiter)

set(MBLIMITER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/mblimiter.plugin.json")
set(MBLIMITER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/mblimiter_params.h")
set(MBLIMITER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/mblimiterModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${MBLIMITER_PARAMS_H}" "${MBLIMITER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${MBLIMITER_DESC}"
    --cpp-out "${MBLIMITER_PARAMS_H}"
    --ts-out "${MBLIMITER_MODEL_TS}"
    --namespace Mblimiter
  DEPENDS "${MBLIMITER_DESC}" "${CODEGEN}"
  COMMENT "Codegen mblimiter plugin from descriptor"
  VERBATIM
)

add_custom_target(mblimiter_codegen DEPENDS "${MBLIMITER_PARAMS_H}" "${MBLIMITER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTMblimiter"
  SOURCES_LIST
    source/mblimiter_dsp.h
    source/mblimiter_dsp.cpp
    source/mblimiter_entry.cpp
    source/version.h
    "${MBLIMITER_PARAMS_H}"
)

add_dependencies(${target} mblimiter_codegen)

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

calfnxt_copy_plugin_ui(${target} mblimiter calfNXTMblimiter)
calfnxt_copy_web_host(${target})
