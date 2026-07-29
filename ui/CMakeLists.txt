# Shared React UI build (SPA → ui/dist; each VST3 embeds only its plugin pack)
find_program(NPM_EXECUTABLE npm)

set(CALFNXT_UI_DIST "${CMAKE_SOURCE_DIR}/ui/dist" CACHE PATH "Vite SPA UI output")
set(CALFNXT_UI_DIST_STAMP "${CALFNXT_UI_DIST}/.stamp")

if(NPM_EXECUTABLE)
  add_custom_command(
    OUTPUT "${CALFNXT_UI_DIST_STAMP}"
    COMMAND ${NPM_EXECUTABLE} install
    COMMAND ${NPM_EXECUTABLE} run build
    COMMAND ${CMAKE_COMMAND} -E touch "${CALFNXT_UI_DIST_STAMP}"
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/ui"
    DEPENDS
      "${CMAKE_SOURCE_DIR}/ui/package.json"
      "${CMAKE_SOURCE_DIR}/ui/vite.config.ts"
      "${CMAKE_SOURCE_DIR}/ui/index.html"
      "${CMAKE_SOURCE_DIR}/ui/src/html/equalizer.html"
      "${CMAKE_SOURCE_DIR}/ui/src/html/stereo.html"
      "${CMAKE_SOURCE_DIR}/ui/scripts/pack-plugin-ui.mjs"
      "${CMAKE_SOURCE_DIR}/ui/src/main.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/App.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/reportViewport.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/entries/equalizer.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/entries/stereo.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/registry.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/styles.css"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/EqualizerUI/EqualizerUI.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/EqualizerUI/EqualizerUI.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/EqualizerUI/BoundEqualizerUI.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/StereoUI/StereoUI.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/StereoUI/StereoUI.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/plugins/StereoUI/BoundStereoUI.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/components/Header/Header.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/components/Header/Header.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Fader/Fader.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Fader/Fader.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Knob/Knob.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Knob/Knob.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/LevelMeter/LevelMeter.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/LevelMeter/LevelMeter.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/MultiMeter/MultiMeter.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/MultiMeter/MultiMeter.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/CorrelationMeter/CorrelationMeter.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/CorrelationMeter/CorrelationMeter.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/GonioMeter/GonioMeter.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/GonioMeter/GonioMeter.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/EQChart/EQChart.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/EQChart/EQChart.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Toggle/Toggle.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Select/Select.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Button/Button.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Buttons/Buttons.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Buttons/Buttons.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/ConfirmButton/ConfirmButton.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Loading/Loading.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Loading/Loading.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Icon/Icon.tsx"
      "${CMAKE_SOURCE_DIR}/ui/src/widgets/Icon/Icon.scss"
      "${CMAKE_SOURCE_DIR}/ui/src/bind_param.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/bridge.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/host/headerMeters.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/host/equalizerHost.ts"
      "${CMAKE_SOURCE_DIR}/ui/src/host/stereoHost.ts"
    COMMENT "Build shared React UI → ui/dist (+ per-plugin packs)"
    VERBATIM
  )
  add_custom_target(calfnxt_web_ui DEPENDS "${CALFNXT_UI_DIST_STAMP}")
else()
  add_custom_target(calfnxt_web_ui)
  message(STATUS "npm not found — using existing ui/dist assets")
endif()

# Embed only this plugin's packed SPA into the VST3 Resources directory.
# Important: do NOT use POST_BUILD only — that skips the copy when the .so is
# already up to date after a UI-only change.
function(calfnxt_copy_plugin_ui target plugin_id)
  add_dependencies(${target} calfnxt_web_ui)

  set(res_stamp "${CMAKE_BINARY_DIR}/${target}.resources.stamp")
  set(plugin_dist "${CALFNXT_UI_DIST}/plugins/${plugin_id}")
  # Refresh SPA assets only — keep moduleinfo.json from moduleinfotool.
  add_custom_command(
    OUTPUT "${res_stamp}"
    COMMAND ${CMAKE_COMMAND} -E rm -rf
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E make_directory
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
      "${plugin_dist}/assets"
      "$<TARGET_FILE_DIR:${target}>/../Resources/assets"
    COMMAND ${CMAKE_COMMAND} -E copy
      "${plugin_dist}/index.html"
      "$<TARGET_FILE_DIR:${target}>/../Resources/index.html"
    COMMAND ${CMAKE_COMMAND} -E touch "${res_stamp}"
    DEPENDS
      calfnxt_web_ui
      "${CALFNXT_UI_DIST_STAMP}"
      ${target}
    COMMENT "Embed ${plugin_id} UI into ${target} Resources"
    VERBATIM
  )
  add_custom_target(${target}-resources ALL DEPENDS "${res_stamp}")
endfunction()
