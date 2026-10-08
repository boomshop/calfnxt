# Denoiser — spectral noise reduction (STFT Wiener, 3 profiles)
set(target calfnxt-denoiser)

set(DENOISER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/denoiser.plugin.json")
set(DENOISER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/denoiser_params.h")
set(DENOISER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/denoiserModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${DENOISER_PARAMS_H}" "${DENOISER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${DENOISER_DESC}"
    --cpp-out "${DENOISER_PARAMS_H}"
    --ts-out "${DENOISER_MODEL_TS}"
    --namespace Denoiser
  DEPENDS "${DENOISER_DESC}" "${CODEGEN}"
  COMMENT "Codegen denoiser plugin from descriptor"
  VERBATIM
)

add_custom_target(denoiser_codegen DEPENDS "${DENOISER_PARAMS_H}" "${DENOISER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTDenoiser"
  SOURCES_LIST
    source/denoiser_dsp.h
    source/denoiser_dsp.cpp
    source/denoiser_entry.cpp
    source/version.h
    "${DENOISER_PARAMS_H}"
)

add_dependencies(${target} denoiser_codegen)

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

calfnxt_copy_plugin_ui(${target} denoiser calfNXTDenoiser)
calfnxt_copy_web_host(${target})
