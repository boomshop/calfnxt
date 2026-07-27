# Shared DSP base (SingleComponent + stereo + WebEditor)
set(VST3_SDK_ROOT "${CMAKE_SOURCE_DIR}/external/vst3sdk")

add_library(calfnxt_dsp STATIC
  effect_base.cpp
  effect_base.h
  ${VST3_SDK_ROOT}/public.sdk/source/vst/vstsinglecomponenteffect.cpp
)

target_include_directories(calfnxt_dsp
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
  PRIVATE
    ${VST3_SDK_ROOT}
)

target_link_libraries(calfnxt_dsp
  PUBLIC
    calfnxt_ui
)

target_compile_features(calfnxt_dsp PUBLIC cxx_std_17)
set_target_properties(calfnxt_dsp PROPERTIES POSITION_INDEPENDENT_CODE ON)
