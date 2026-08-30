#pragma once
// Generated from tuner.plugin.json — do not edit.

#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ustring.h"
#include "pluginterfaces/vst/vsttypes.h"
#include "public.sdk/source/vst/vstparameters.h"

namespace calfNXT {
namespace Tuner {

static const Steinberg::FUID kPluginUID(0x54554E45, 0x52303131, 0x43414C46, 0x4E585430);

static constexpr const char* kPluginName = "calfNXT Tuner";
static constexpr const char* kPluginCategory = "Fx|Pitch Shift";
static constexpr const char* kEditorHtml = "index.html";
static constexpr Steinberg::int32 kEditorWidth = 1024;
static constexpr Steinberg::int32 kEditorHeight = 680;

enum : Steinberg::Vst::ParamID
{
  kParamInGain = 0,
  kParamOutGain = 1,
  kParamBypass = 2,
  kParamProfile = 3,
  kParamQuality = 4,
  kParamFormant = 5,
  kParamRetune = 6,
  kParamRelease = 7,
  kParamAmount = 8,
  kParamThreshold = 9,
  kParamFlex = 10,
  kParamVibrato = 11,
  kParamSettle = 12,
  kParamOctaveProtect = 13,
  kParamUnvoiced = 14,
  kParamDetect = 15,
  kParamFmin = 16,
  kParamFmax = 17,
  kParamRef = 18,
  kParamNoteC = 19,
  kParamNoteCs = 20,
  kParamNoteD = 21,
  kParamNoteDs = 22,
  kParamNoteE = 23,
  kParamNoteF = 24,
  kParamNoteFs = 25,
  kParamNoteG = 26,
  kParamNoteGs = 27,
  kParamNoteA = 28,
  kParamNoteAs = 29,
  kParamNoteB = 30,
  kParamVibOn = 31,
  kParamVibDelay = 32,
  kParamVibFade = 33,
  kParamVibRate = 34,
};

static constexpr Steinberg::int32 kParamCount = 35;

inline void registerParameters(Steinberg::Vst::ParameterContainer& parameters)
{
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("In"), kParamInGain, STR16("dB"),
      -60.0, 12.0, 0.0);
    p->setPrecision(1);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Out"), kParamOutGain, STR16("dB"),
      -60.0, 12.0, 0.0);
    p->setPrecision(1);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Bypass"), kParamBypass, STR16(""),
      0.0, 1.0, 0.0);
    p->setPrecision(0);
    p->getInfo().flags |= Steinberg::Vst::ParameterInfo::kIsBypass;
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Source"), kParamProfile, STR16(""),
      0.0, 2.0, 0.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Quality"), kParamQuality, STR16(""),
      0.0, 1.0, 0.75);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Formant"), kParamFormant, STR16("%"),
      0.0, 1.0, 0.85);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Retune"), kParamRetune, STR16("ms"),
      1.0, 400.0, 80.0);
    p->setPrecision(1);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Release"), kParamRelease, STR16("ms"),
      10.0, 2000.0, 120.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Amount"), kParamAmount, STR16("%"),
      0.0, 1.0, 1.0);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Threshold"), kParamThreshold, STR16("ct"),
      0.0, 50.0, 10.0);
    p->setPrecision(1);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Flex"), kParamFlex, STR16("ct"),
      0.0, 400.0, 100.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Keep"), kParamVibrato, STR16("%"),
      0.0, 1.0, 0.75);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Depth"), kParamSettle, STR16("%"),
      0.0, 1.0, 0.4);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Octave"), kParamOctaveProtect, STR16("%"),
      0.0, 1.0, 0.88);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Unvoiced"), kParamUnvoiced, STR16("%"),
      0.0, 1.0, 0.58);
    p->setPrecision(2);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Detect"), kParamDetect, STR16(""),
      0.0, 3.0, 0.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Low"), kParamFmin, STR16("Hz"),
      25.0, 400.0, 80.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("High"), kParamFmax, STR16("Hz"),
      200.0, 2000.0, 700.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("A4"), kParamRef, STR16("Hz"),
      415.0, 466.0, 440.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("C"), kParamNoteC, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("C#"), kParamNoteCs, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("D"), kParamNoteD, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("D#"), kParamNoteDs, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("E"), kParamNoteE, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("F"), kParamNoteF, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("F#"), kParamNoteFs, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("G"), kParamNoteG, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("G#"), kParamNoteGs, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("A"), kParamNoteA, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("A#"), kParamNoteAs, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("B"), kParamNoteB, STR16(""),
      0.0, 1.0, 1.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Vibrato"), kParamVibOn, STR16(""),
      0.0, 1.0, 0.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Delay"), kParamVibDelay, STR16("ms"),
      0.0, 2000.0, 100.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Fade"), kParamVibFade, STR16("ms"),
      0.0, 2000.0, 200.0);
    p->setPrecision(0);
    parameters.addParameter(p);
  }
  {
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("Rate"), kParamVibRate, STR16("Hz"),
      2.0, 10.0, 5.0);
    p->setPrecision(1);
    parameters.addParameter(p);
  }
}

} // namespace Tuner
} // namespace calfNXT
