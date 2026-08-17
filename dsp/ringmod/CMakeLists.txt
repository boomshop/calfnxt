# Ring Modulator — Calf-heritage stereo ring modulator + dual LFOs
set(target calfnxt-ringmod)

set(RINGMOD_DESC "${CMAKE_CURRENT_SOURCE_DIR}/ringmod.plugin.json")
set(RINGMOD_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/ringmod_params.h")
set(RINGMOD_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/ringmodModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${RINGMOD_PARAMS_H}" "${RINGMOD_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${RINGMOD_DESC}"
    --cpp-out "${RINGMOD_PARAMS_H}"
    --ts-out "${RINGMOD_MODEL_TS}"
    --namespace Ringmod
  DEPENDS "${RINGMOD_DESC}" "${CODEGEN}"
  COMMENT "Codegen ringmod plugin from descriptor"
  VERBATIM
)

add_custom_target(ringmod_codegen DEPENDS "${RINGMOD_PARAMS_H}" "${RINGMOD_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTRingmodulator"
  SOURCES_LIST
    source/ringmod_dsp.h
    source/ringmod_dsp.cpp
    source/ringmod_entry.cpp
    source/version.h
    "${RINGMOD_PARAMS_H}"
)

add_dependencies(${target} ringmod_codegen)

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

calfnxt_copy_plugin_ui(${target} ringmod calfNXTRingmodulator)
calfnxt_copy_web_host(${target})
