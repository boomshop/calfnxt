cmake_minimum_required(VERSION 3.25)

# Lean: no SDK examples, no VSTGUI
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
# Avoid POST_BUILD rm/ln on ~/.vst3 (fails if the symlink is not writable).
set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)

project(calfnxt
  VERSION 1.0.1
  DESCRIPTION "calfNXT — VST3 + Web UI"
  LANGUAGES C CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(GNUInstallDirs)

# Distro / cmake --install destination (under CMAKE_INSTALL_PREFIX; DESTDIR applies).
# Override e.g. -DCALFNXT_VST3_INSTALL_DIR=lib64/vst3 if needed.
set(CALFNXT_VST3_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/vst3" CACHE STRING
  "Relative install dir for .vst3 bundles (under CMAKE_INSTALL_PREFIX)")

# Developer convenience target install-user-vst3-copy (default: ~/.vst3).
# Override at configure time, or at copy time via env/script:
#   CALFNXT_VST3_DIR=/usr/lib/vst3 cmake --build build --target install-user-vst3-copy
#   ./tools/install-user-vst3.sh /usr/lib/vst3
if(DEFINED ENV{HOME} AND NOT "$ENV{HOME}" STREQUAL "")
  set(_calfnxt_default_user_vst3 "$ENV{HOME}/.vst3")
else()
  set(_calfnxt_default_user_vst3 "${CMAKE_BINARY_DIR}/vst3-user-install")
endif()
set(CALFNXT_USER_VST3_DIR "${_calfnxt_default_user_vst3}" CACHE PATH
  "Default destination for install-user-vst3-copy (overridable via CALFNXT_VST3_DIR env)")

add_subdirectory(external/vst3sdk)

# Not visible from the SDK subdir — needed for linuxmain.cpp / smtg_target_add_library_main
set(SDK_ROOT "${CMAKE_SOURCE_DIR}/external/vst3sdk")
set(public_sdk_SOURCE_DIR "${SDK_ROOT}/public.sdk")

find_package(PkgConfig REQUIRED)
find_package(Python3 REQUIRED COMPONENTS Interpreter)
pkg_check_modules(GTK3 REQUIRED IMPORTED_TARGET gtk+-3.0)
pkg_check_modules(WEBKIT REQUIRED IMPORTED_TARGET webkit2gtk-4.1)

add_subdirectory(ui)
add_subdirectory(common/ui)
add_subdirectory(common/dsp)
add_subdirectory(dsp/equalizer)
add_subdirectory(dsp/stereo)
add_subdirectory(dsp/transients)
add_subdirectory(dsp/compressor)
add_subdirectory(dsp/expander)
add_subdirectory(dsp/deesser)
add_subdirectory(dsp/delay)
add_subdirectory(dsp/reverb)
add_subdirectory(dsp/mbcomp)
add_subdirectory(dsp/limiter)
add_subdirectory(dsp/mblimiter)
add_subdirectory(dsp/harmonics)
add_subdirectory(dsp/analyzer)
add_subdirectory(dsp/filter)
add_subdirectory(dsp/ringmod)
add_subdirectory(dsp/pulsator)
add_subdirectory(dsp/crusher)
add_subdirectory(dsp/phaser)
add_subdirectory(dsp/flanger)
add_subdirectory(dsp/chorus)

# After every plugin registered via calfnxt_copy_web_host: refresh helpers whenever
# calfnxt-web-host is rebuilt (plugin .so may be unchanged).
get_property(_calfnxt_web_host_plugins GLOBAL PROPERTY CALFNXT_WEB_HOST_PLUGIN_TARGETS)
set(_calfnxt_web_host_bundle_cmds)
foreach(_t IN LISTS _calfnxt_web_host_plugins)
  list(APPEND _calfnxt_web_host_bundle_cmds
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:${_t}>"
    COMMAND ${CMAKE_COMMAND} -E copy
      "$<TARGET_FILE:calfnxt-web-host>"
      "$<TARGET_FILE_DIR:${_t}>/calfnxt-web-host"
  )
endforeach()
add_custom_target(calfnxt-web-host-bundles
  ${_calfnxt_web_host_bundle_cmds}
  DEPENDS calfnxt-web-host
  COMMENT "Refresh calfnxt-web-host inside all plugin VST3 bundles"
)

# UI build needs generated models from every plugin descriptor
add_dependencies(calfnxt_web_ui equalizer_codegen stereo_codegen transients_codegen compressor_codegen expander_codegen deesser_codegen delay_codegen reverb_codegen mbcomp_codegen limiter_codegen mblimiter_codegen harmonics_codegen analyzer_codegen filter_codegen ringmod_codegen pulsator_codegen crusher_codegen phaser_codegen flanger_codegen chorus_codegen)

# Meta-target: all plugins + embedded UI packs (add new plugins here).
add_custom_target(calfnxt-plugins
  DEPENDS
    calfnxt-equalizer
    calfnxt-equalizer-resources
    calfnxt-stereo
    calfnxt-stereo-resources
    calfnxt-transients
    calfnxt-transients-resources
    calfnxt-compressor
    calfnxt-compressor-resources
    calfnxt-expander
    calfnxt-expander-resources
    calfnxt-deesser
    calfnxt-deesser-resources
    calfnxt-delay
    calfnxt-delay-resources
    calfnxt-reverb
    calfnxt-reverb-resources
    calfnxt-mbcomp
    calfnxt-mbcomp-resources
    calfnxt-limiter
    calfnxt-limiter-resources
    calfnxt-mblimiter
    calfnxt-mblimiter-resources
    calfnxt-harmonics
    calfnxt-harmonics-resources
    calfnxt-analyzer
    calfnxt-analyzer-resources
    calfnxt-filter
    calfnxt-filter-resources
    calfnxt-ringmod
    calfnxt-ringmod-resources
    calfnxt-pulsator
    calfnxt-pulsator-resources
    calfnxt-crusher
    calfnxt-crusher-resources
    calfnxt-phaser
    calfnxt-phaser-resources
    calfnxt-flanger
    calfnxt-flanger-resources
    calfnxt-chorus
    calfnxt-chorus-resources
    calfnxt-web-host
    calfnxt-web-host-bundles
  COMMENT "Build all calfNXT VST3 plugins (+ embedded UI + web-host)"
)

# Install bundles: cmake --install (prefix/DESTDIR) and optional user copy target.
# Prefer ./tools/install-user-vst3.sh for a force UI rebuild + copy to ~/.vst3
# (or a custom path). Distros should use: cmake --install <build> [--prefix /usr]
get_property(_calfnxt_install_targets GLOBAL PROPERTY CALFNXT_INSTALL_TARGETS)
get_property(_calfnxt_install_names GLOBAL PROPERTY CALFNXT_INSTALL_VST3_NAMES)
list(LENGTH _calfnxt_install_targets _calfnxt_install_n)
if(_calfnxt_install_n GREATER 0)
  set(_calfnxt_bundle_dirs_genex)
  set(_calfnxt_bundle_names_list)
  math(EXPR _calfnxt_install_last "${_calfnxt_install_n} - 1")
  foreach(_i RANGE ${_calfnxt_install_last})
    list(GET _calfnxt_install_targets ${_i} _t)
    list(GET _calfnxt_install_names ${_i} _name)
    # TARGET_FILE_DIR = …/<name>.vst3/Contents/<arch> → bundle root is ../..
    list(APPEND _calfnxt_bundle_dirs_genex "$<TARGET_FILE_DIR:${_t}>/../..")
    list(APPEND _calfnxt_bundle_names_list "${_name}")

    # System / packaging install (CMAKE_INSTALL_PREFIX + DESTDIR).
    # Do not use install(DIRECTORY …/../..) — the last path component would be "..".
    install(CODE "
      set(_src \"$<TARGET_FILE_DIR:${_t}>/../..\")
      get_filename_component(_src \"\${_src}\" ABSOLUTE)
      set(_dst \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}/${CALFNXT_VST3_INSTALL_DIR}/${_name}.vst3\")
      if(NOT EXISTS \"\${_src}\")
        message(FATAL_ERROR \"calfnxt install: missing \${_src} — build target ${_t} first\")
      endif()
      message(STATUS \"calfnxt: cmake --install ${_name}.vst3 → \${_dst}\")
      file(REMOVE_RECURSE \"\${_dst}\")
      file(MAKE_DIRECTORY \"\${_dst}\")
      file(COPY \"\${_src}/\" DESTINATION \"\${_dst}\")
    " COMPONENT Runtime)
  endforeach()

  string(JOIN ";" _calfnxt_bundle_dirs_joined ${_calfnxt_bundle_dirs_genex})
  list(JOIN _calfnxt_bundle_names_list ";" _calfnxt_bundle_names_joined)

  set(_calfnxt_install_copy_deps calfnxt-web-host calfnxt-web-host-bundles)
  set(_calfnxt_install_force_cmds
    COMMAND ${CMAKE_COMMAND}
      -DCALFNXT_UI_DIST_STAMP=${CALFNXT_UI_DIST_STAMP}
      -DCALFNXT_BINARY_DIR=${CMAKE_BINARY_DIR}
      -P "${CMAKE_SOURCE_DIR}/tools/cmake/clear_ui_stamps.cmake"
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target calfnxt_web_ui --parallel
  )
  set(_calfnxt_install_force_deps calfnxt-web-host)
  foreach(_i RANGE ${_calfnxt_install_last})
    list(GET _calfnxt_install_targets ${_i} _t)
    list(APPEND _calfnxt_install_copy_deps ${_t} ${_t}-resources)
    list(APPEND _calfnxt_install_force_cmds
      COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target ${_t}-resources --parallel
    )
    list(APPEND _calfnxt_install_force_deps ${_t})
  endforeach()
  list(APPEND _calfnxt_install_force_cmds
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target calfnxt-web-host-bundles --parallel
    COMMAND ${CMAKE_COMMAND} --build "${CMAKE_BINARY_DIR}" --target install-user-vst3-copy --parallel
  )

  # Dest: env CALFNXT_VST3_DIR at copy time, else CALFNXT_USER_VST3_DIR (cache).
  add_custom_target(install-user-vst3-copy
    COMMAND ${CMAKE_COMMAND}
      "-DCALFNXT_VST3_DIR_DEFAULT=${CALFNXT_USER_VST3_DIR}"
      "-DCALFNXT_BUNDLE_DIRS=${_calfnxt_bundle_dirs_joined}"
      "-DCALFNXT_BUNDLE_NAMES=${_calfnxt_bundle_names_joined}"
      -P "${CMAKE_SOURCE_DIR}/tools/cmake/copy_vst3_bundles.cmake"
    COMMENT "Install calfNXT plugins → \$CALFNXT_VST3_DIR or ${CALFNXT_USER_VST3_DIR}"
    DEPENDS ${_calfnxt_install_copy_deps}
    VERBATIM
  )
  add_custom_target(install-user-vst3
    ${_calfnxt_install_force_cmds}
    COMMENT "Force UI rebuild + install → ${CALFNXT_USER_VST3_DIR} (or \$CALFNXT_VST3_DIR)"
    DEPENDS ${_calfnxt_install_force_deps}
  )

  set(_calfnxt_res_list "")
  foreach(_t IN LISTS _calfnxt_install_targets)
    string(APPEND _calfnxt_res_list "${_t}-resources\n")
  endforeach()
  file(WRITE "${CMAKE_BINARY_DIR}/calfnxt-install-resources.txt" "${_calfnxt_res_list}")

  message(STATUS "calfnxt: cmake --install → \${PREFIX}/${CALFNXT_VST3_INSTALL_DIR}/")
  message(STATUS "calfnxt: user copy default → ${CALFNXT_USER_VST3_DIR}")
endif()

message(STATUS "calfnxt: common/{ui,dsp} + dsp/{equalizer,stereo,transients,compressor,deesser} + shared ui/dist")
message(STATUS "calfnxt: build all plugins with --target calfnxt-plugins")
