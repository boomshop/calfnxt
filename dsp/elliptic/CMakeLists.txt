# Elliptic — mono bass below a Linkwitz–Riley split, mid phase-matched
set(target calfnxt-elliptic)

set(ELLIPTIC_DESC "${CMAKE_CURRENT_SOURCE_DIR}/elliptic.plugin.json")
set(ELLIPTIC_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/elliptic_params.h")
set(ELLIPTIC_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/ellipticModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${ELLIPTIC_PARAMS_H}" "${ELLIPTIC_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${ELLIPTIC_DESC}"
    --cpp-out "${ELLIPTIC_PARAMS_H}"
    --ts-out "${ELLIPTIC_MODEL_TS}"
    --namespace Elliptic
  DEPENDS "${ELLIPTIC_DESC}" "${CODEGEN}"
  COMMENT "Codegen elliptic plugin from descriptor"
  VERBATIM
)

add_custom_target(elliptic_codegen DEPENDS "${ELLIPTIC_PARAMS_H}" "${ELLIPTIC_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTElliptic"
  SOURCES_LIST
    source/elliptic_dsp.h
    source/elliptic_dsp.cpp
    source/elliptic_entry.cpp
    source/version.h
    "${ELLIPTIC_PARAMS_H}"
)

add_dependencies(${target} elliptic_codegen)

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

calfnxt_copy_plugin_ui(${target} elliptic calfNXTElliptic)
calfnxt_copy_web_host(${target})
