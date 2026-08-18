# Phaser — Calf-heritage stereo phaser (allpass cascade + LFO)
set(target calfnxt-phaser)

set(PHASER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/phaser.plugin.json")
set(PHASER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/phaser_params.h")
set(PHASER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/phaserModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${PHASER_PARAMS_H}" "${PHASER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${PHASER_DESC}"
    --cpp-out "${PHASER_PARAMS_H}"
    --ts-out "${PHASER_MODEL_TS}"
    --namespace Phaser
  DEPENDS "${PHASER_DESC}" "${CODEGEN}"
  COMMENT "Codegen phaser plugin from descriptor"
  VERBATIM
)

add_custom_target(phaser_codegen DEPENDS "${PHASER_PARAMS_H}" "${PHASER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTPhaser"
  SOURCES_LIST
    source/phaser_dsp.h
    source/phaser_dsp.cpp
    source/phaser_entry.cpp
    source/version.h
    "${PHASER_PARAMS_H}"
)

add_dependencies(${target} phaser_codegen)

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

calfnxt_copy_plugin_ui(${target} phaser calfNXTPhaser)
calfnxt_copy_web_host(${target})
