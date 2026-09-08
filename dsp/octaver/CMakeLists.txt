# Octaver — monophonic stereo octave layers + sub
set(target calfnxt-octaver)

set(OCTAVER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/octaver.plugin.json")
set(OCTAVER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/octaver_params.h")
set(OCTAVER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/octaverModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${OCTAVER_PARAMS_H}" "${OCTAVER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${OCTAVER_DESC}"
    --cpp-out "${OCTAVER_PARAMS_H}"
    --ts-out "${OCTAVER_MODEL_TS}"
    --namespace Octaver
  DEPENDS "${OCTAVER_DESC}" "${CODEGEN}"
  COMMENT "Codegen octaver plugin from descriptor"
  VERBATIM
)

add_custom_target(octaver_codegen DEPENDS "${OCTAVER_PARAMS_H}" "${OCTAVER_MODEL_TS}")

# Shared object library: VST3 bundle + offline WAV harness compile the same DSP.
add_library(calfnxt_octaver_dsp OBJECT
  source/octaver_dsp.cpp
  source/octaver_dsp.h
  source/version.h
  "${OCTAVER_PARAMS_H}"
)
add_dependencies(calfnxt_octaver_dsp octaver_codegen)
target_include_directories(calfnxt_octaver_dsp PUBLIC
  source
  ${CMAKE_CURRENT_BINARY_DIR}
  ${CMAKE_CURRENT_BINARY_DIR}/generated
)
target_link_libraries(calfnxt_octaver_dsp PUBLIC calfnxt_dsp)
target_compile_features(calfnxt_octaver_dsp PUBLIC cxx_std_17)
set_target_properties(calfnxt_octaver_dsp PROPERTIES POSITION_INDEPENDENT_CODE ON)

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTOctaver"
  SOURCES_LIST
    source/octaver_entry.cpp
    source/version.h
    "${OCTAVER_PARAMS_H}"
)

target_sources(${target} PRIVATE $<TARGET_OBJECTS:calfnxt_octaver_dsp>)
add_dependencies(${target} octaver_codegen calfnxt_octaver_dsp)

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

calfnxt_copy_plugin_ui(${target} octaver calfNXTOctaver)
calfnxt_copy_web_host(${target})
