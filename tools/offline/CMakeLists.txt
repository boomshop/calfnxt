# Offline DSP harness — feeds WAV blocks into the REAL plugin process().
# Octaver first; same pattern later for compressor etc.

set(CALFNXT_OFFLINE_DIR ${CMAKE_CURRENT_SOURCE_DIR})

# OBJECT library so VST bundle and offline CLI share one compile of octaver_dsp.cpp.
# (Defined in dsp/octaver/CMakeLists.txt as calfnxt_octaver_dsp.)

add_executable(calfnxt-offline-octaver
  octaver_offline_main.cpp
)

target_include_directories(calfnxt-offline-octaver PRIVATE
  ${CALFNXT_OFFLINE_DIR}
  ${CMAKE_SOURCE_DIR}/dsp/octaver/source
  ${CMAKE_BINARY_DIR}/dsp/octaver/generated
  ${CMAKE_SOURCE_DIR}/external/vst3sdk
)

target_link_libraries(calfnxt-offline-octaver PRIVATE
  calfnxt_octaver_dsp
  calfnxt_dsp
)

target_compile_features(calfnxt-offline-octaver PRIVATE cxx_std_17)

add_dependencies(calfnxt-offline-octaver octaver_codegen)
