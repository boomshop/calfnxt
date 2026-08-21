# Split — mono input to stereo outputs with per-channel trim / mute / phase
set(target calfnxt-split)

set(SPLIT_DESC "${CMAKE_CURRENT_SOURCE_DIR}/split.plugin.json")
set(SPLIT_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/split_params.h")
set(SPLIT_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/splitModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${SPLIT_PARAMS_H}" "${SPLIT_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${SPLIT_DESC}"
    --cpp-out "${SPLIT_PARAMS_H}"
    --ts-out "${SPLIT_MODEL_TS}"
    --namespace Split
  DEPENDS "${SPLIT_DESC}" "${CODEGEN}"
  COMMENT "Codegen split plugin from descriptor"
  VERBATIM
)

add_custom_target(split_codegen DEPENDS "${SPLIT_PARAMS_H}" "${SPLIT_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTSplit"
  SOURCES_LIST
    source/split_dsp.h
    source/split_dsp.cpp
    source/split_entry.cpp
    source/version.h
    "${SPLIT_PARAMS_H}"
)

add_dependencies(${target} split_codegen)

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

calfnxt_copy_plugin_ui(${target} split calfNXTSplit)
calfnxt_copy_web_host(${target})
