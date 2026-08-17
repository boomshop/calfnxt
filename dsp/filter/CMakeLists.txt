# Filter — multimode filter + optional envelope follower
set(target calfnxt-filter)

set(FILTER_DESC "${CMAKE_CURRENT_SOURCE_DIR}/filter.plugin.json")
set(FILTER_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/filter_params.h")
set(FILTER_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/filterModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
  OUTPUT "${FILTER_PARAMS_H}" "${FILTER_MODEL_TS}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
  COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
    --descriptor "${FILTER_DESC}"
    --cpp-out "${FILTER_PARAMS_H}"
    --ts-out "${FILTER_MODEL_TS}"
    --namespace Filter
  DEPENDS "${FILTER_DESC}" "${CODEGEN}"
  COMMENT "Codegen filter plugin from descriptor"
  VERBATIM
)

add_custom_target(filter_codegen DEPENDS "${FILTER_PARAMS_H}" "${FILTER_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTFilter"
  SOURCES_LIST
    source/filter_dsp.h
    source/filter_dsp.cpp
    source/filter_entry.cpp
    source/version.h
    "${FILTER_PARAMS_H}"
)

add_dependencies(${target} filter_codegen)

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

calfnxt_copy_plugin_ui(${target} filter calfNXTFilter)
calfnxt_copy_web_host(${target})
