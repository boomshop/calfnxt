#include "equalizer_dsp.h"
#include "equalizer_params.h"
#include "version.h"

#include "public.sdk/source/main/pluginfactory.h"

using namespace Steinberg;
using namespace calfNXT::Equalizer;

//------------------------------------------------------------------------
BEGIN_FACTORY_DEF(stringCompanyName, stringCompanyWeb, stringCompanyEmail)

  DEF_CLASS2(INLINE_UID_FROM_FUID(kPluginUID),
             PClassInfo::kManyInstances,
             kVstAudioEffectClass,
             kPluginName,
             0, // SingleComponent — not distributable
             kPluginCategory,
             FULL_VERSION_STR,
             kVstVersionString,
             EqualizerPlugin::createInstance)

END_FACTORY
