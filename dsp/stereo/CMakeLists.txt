# Stereo — Calf heritage spatial utility + side decorrelate
set(target calfnxt-stereo)

set(STEREO_DESC "${CMAKE_CURRENT_SOURCE_DIR}/stereo.plugin.json")
set(STEREO_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/stereo_params.h")
set(STEREO_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/stereoModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${STEREO_PARAMS_H}" "${STEREO_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${STEREO_DESC}"
    --cpp-out "${STEREO_PARAMS_H}"
    --ts-out "${STEREO_MODEL_TS}"
    --namespace Stereo
  DEPENDS "${STEREO_DESC}" "${CODEGEN}"
  COMMENT "Codegen stereo plugin from descriptor"
  VERBATIM
)

add_custom_target(stereo_codegen DEPENDS "${STEREO_PARAMS_H}" "${STEREO_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTStereo"
  SOURCES_LIST
    source/stereo_dsp.h
    source/stereo_dsp.cpp
    source/stereo_entry.cpp
    source/version.h
    "${STEREO_PARAMS_H}"
)

add_dependencies(${target} stereo_codegen)

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

calfnxt_copy_plugin_ui(${target} stereo calfNXTStereo)
calfnxt_copy_web_host(${target})
