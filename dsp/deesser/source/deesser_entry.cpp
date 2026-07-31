#include "deesser_dsp.h"
#include "deesser_params.h"
#include "version.h"

#include "public.sdk/source/main/pluginfactory.h"

using namespace Steinberg;
using namespace calfNXT::Deesser;

//------------------------------------------------------------------------
BEGIN_FACTORY_DEF(stringCompanyName, stringCompanyWeb, stringCompanyEmail)

  DEF_CLASS2(INLINE_UID_FROM_FUID(kPluginUID),
             PClassInfo::kManyInstances,
             kVstAudioEffectClass,
             kPluginName,
             0,
             kPluginCategory,
             FULL_VERSION_STR,
             kVstVersionString,
             DeesserPlugin::createInstance)

END_FACTORY
