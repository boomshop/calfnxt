# Equalizer — passthrough DSP stub + EQ graph UI
set(target calfnxt-equalizer)

set(EQUALIZER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/equalizer.plugin.json")
set(EQUALIZER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/equalizer_params.h")
set(EQUALIZER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/equalizerModel.ts")
set(PLUGINS_REGISTRY "${CMAKE_BINARY_DIR}/plugins.registry.json")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${EQUALIZER_PARAMS_H}" "${EQUALIZER_MODEL_TS}" "${PLUGINS_REGISTRY}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${EQUALIZER_DESC}"
    --cpp-out "${EQUALIZER_PARAMS_H}"
    --ts-out "${EQUALIZER_MODEL_TS}"
    --registry-out "${PLUGINS_REGISTRY}"
    --namespace Equalizer
  DEPENDS "${EQUALIZER_DESC}" "${CODEGEN}"
  COMMENT "Codegen equalizer plugin from descriptor"
  VERBATIM
)

add_custom_target(equalizer_codegen DEPENDS "${EQUALIZER_PARAMS_H}" "${EQUALIZER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTEqualizer"
  SOURCES_LIST
    source/equalizer_dsp.h
    source/equalizer_dsp.cpp
    source/equalizer_entry.cpp
    source/version.h
    "${EQUALIZER_PARAMS_H}"
)

add_dependencies(${target} equalizer_codegen)

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

calfnxt_copy_plugin_ui(${target})

# TARGET_FILE_DIR = …/<plugin>.vst3/Contents/<arch> → bundle root is ../..
# Bundle basename == .so basename (PACKAGE_NAME) so Carla/JUCE can discover it.
add_custom_target(install-user-vst3
  COMMAND ${CMAKE_COMMAND} -E make_directory "$ENV{HOME}/.vst3"
  # Drop retired sample plugins if still present from earlier installs.
  COMMAND ${CMAKE_COMMAND} -E rm -rf
    "$ENV{HOME}/.vst3/calfNXTVolume.vst3"
    "$ENV{HOME}/.vst3/calfNXTBalance.vst3"
  COMMAND ${CMAKE_COMMAND} -E rm -rf
    "$ENV{HOME}/.vst3/calfNXTEqualizer.vst3"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
    "$<TARGET_FILE_DIR:calfnxt-equalizer>/../.."
    "$ENV{HOME}/.vst3/calfNXTEqualizer.vst3"
  COMMENT "Install Equalizer VST3 → ~/.vst3"
  DEPENDS
    calfnxt-equalizer
    calfnxt-equalizer-resources
)
