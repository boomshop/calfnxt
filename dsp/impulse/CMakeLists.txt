# Impulse — partitioned convolution reverb (WAV / AIFF IR library)
set(target calfnxt-impulse)
find_package(Threads REQUIRED)

set(IMPULSE_DESC "${CMAKE_CURRENT_SOURCE_DIR}/impulse.plugin.json")
set(IMPULSE_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/impulse_params.h")
set(IMPULSE_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/impulseModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${IMPULSE_PARAMS_H}" "${IMPULSE_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${IMPULSE_DESC}"
    --cpp-out "${IMPULSE_PARAMS_H}"
    --ts-out "${IMPULSE_MODEL_TS}"
    --namespace Impulse
  DEPENDS "${IMPULSE_DESC}" "${CODEGEN}"
  COMMENT "Codegen impulse plugin from descriptor"
  VERBATIM
)

add_custom_target(impulse_codegen DEPENDS "${IMPULSE_PARAMS_H}" "${IMPULSE_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTImpulse"
  SOURCES_LIST
    source/impulse_dsp.h
    source/impulse_dsp.cpp
    source/impulse_entry.cpp
    source/version.h
    "${IMPULSE_PARAMS_H}"
)

add_dependencies(${target} impulse_codegen)

smtg_target_configure_version_file(${target})

target_include_directories(${target} PRIVATE
  source
  ${CMAKE_CURRENT_BINARY_DIR}
  ${CMAKE_CURRENT_BINARY_DIR}/generated
)

target_link_libraries(${target}
  PRIVATE
    calfnxt_dsp
    Threads::Threads
)

target_compile_features(${target} PUBLIC cxx_std_17)

calfnxt_copy_plugin_ui(${target} impulse calfNXTImpulse)
calfnxt_copy_web_host(${target})
