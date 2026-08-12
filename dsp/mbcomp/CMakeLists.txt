# Multiband Compressor — Linkwitz-Riley split + per-band feed-forward GR
set(target calfnxt-mbcomp)

set(MBCOMP_DESC "${CMAKE_CURRENT_SOURCE_DIR}/mbcomp.plugin.json")
set(MBCOMP_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/mbcomp_params.h")
set(MBCOMP_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/mbcompModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${MBCOMP_PARAMS_H}" "${MBCOMP_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${MBCOMP_DESC}"
    --cpp-out "${MBCOMP_PARAMS_H}"
    --ts-out "${MBCOMP_MODEL_TS}"
    --namespace Mbcomp
  DEPENDS "${MBCOMP_DESC}" "${CODEGEN}"
  COMMENT "Codegen mbcomp plugin from descriptor"
  VERBATIM
)

add_custom_target(mbcomp_codegen DEPENDS "${MBCOMP_PARAMS_H}" "${MBCOMP_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTMbcomp"
  SOURCES_LIST
    source/mbcomp_dsp.h
    source/mbcomp_dsp.cpp
    source/mbcomp_entry.cpp
    source/version.h
    "${MBCOMP_PARAMS_H}"
)

add_dependencies(${target} mbcomp_codegen)

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

calfnxt_copy_plugin_ui(${target} mbcomp calfNXTMbcomp)
calfnxt_copy_web_host(${target})
