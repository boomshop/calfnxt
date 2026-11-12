# Phones — headphone crossfeed and a small damped room
set(target calfnxt-phones)

set(PHONES_DESC "${CMAKE_CURRENT_SOURCE_DIR}/phones.plugin.json")
set(PHONES_PARAMS_H "${CMAKE_CURRENT_BINARY_DIR}/generated/phones_params.h")
set(PHONES_MODEL_TS "${CMAKE_SOURCE_DIR}/ui/src/generated/phonesModel.ts")
set(CODEGEN "${CMAKE_SOURCE_DIR}/tools/codegen/generate_plugin.py")

add_custom_command(
    OUTPUT "${PHONES_PARAMS_H}" "${PHONES_MODEL_TS}"
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/generated"
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/ui/src/generated"
    COMMAND ${Python3_EXECUTABLE} "${CODEGEN}"
      --descriptor "${PHONES_DESC}"
      --cpp-out "${PHONES_PARAMS_H}"
      --ts-out "${PHONES_MODEL_TS}"
      --namespace Phones
    DEPENDS "${PHONES_DESC}" "${CODEGEN}"
    COMMENT "Codegen phones plugin from descriptor"
    VERBATIM
)

add_custom_target(phones_codegen DEPENDS "${PHONES_PARAMS_H}" "${PHONES_MODEL_TS}")

smtg_add_vst3plugin(${target}
  PACKAGE_NAME "calfNXTPhones"
  SOURCES_LIST
    source/phones_engine.h
    source/phones_engine.cpp
    source/phones_dsp.h
    source/phones_dsp.cpp
    source/phones_entry.cpp
    source/version.h
    "${PHONES_PARAMS_H}"
)

add_dependencies(${target} phones_codegen)

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

calfnxt_copy_plugin_ui(${target} phones calfNXTPhones)
calfnxt_copy_web_host(${target})
