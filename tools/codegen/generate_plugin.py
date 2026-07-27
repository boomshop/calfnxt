#!/usr/bin/env python3
"""Generate C++ / TypeScript / registry artifacts from a plugin descriptor."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def camel(s: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", s)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def param_enum_name(param_id: str) -> str:
    return "kParam" + camel(param_id)


# Every plugin exposes these as ParamID 0 / 1 (Header In/Out gain).
STANDARD_IO_GAIN_PARAMS: list[dict[str, Any]] = [
    {
        "id": "in_gain",
        "name": "In",
        "type": "float",
        "unit": "dB",
        "min": -60.0,
        "max": 12.0,
        "default": 0.0,
        "scale": "dB",
        "precision": 1,
    },
    {
        "id": "out_gain",
        "name": "Out",
        "type": "float",
        "unit": "dB",
        "min": -60.0,
        "max": 12.0,
        "default": 0.0,
        "scale": "dB",
        "precision": 1,
    },
]


def with_standard_io_gains(params: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prepend In/Out gain when missing; keep explicit defs but force them to ids 0/1."""
    by_id = {p["id"]: p for p in params}
    for req in STANDARD_IO_GAIN_PARAMS:
        if req["id"] not in by_id:
            by_id[req["id"]] = dict(req)
    rest = [p for p in params if p["id"] not in ("in_gain", "out_gain")]
    return [by_id["in_gain"], by_id["out_gain"], *rest]


def expand_bands(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Expand optional bands{count,params,defaults} into flat parameter list."""
    bands = data.get("bands")
    base = list(data.get("parameters") or [])
    if not bands:
        return base
    count = int(bands["count"])
    template = bands["params"]
    defaults = list(bands.get("defaults") or [])
    out = list(base)
    for i in range(count):
        n = i + 1
        nn = f"{n:02d}"
        override = defaults[i] if i < len(defaults) else {}
        for tmpl in template:
            p = dict(tmpl)
            key = p["id"]
            p["id"] = f"b{nn}_{key}"
            p["name"] = f"B{n} {tmpl['name']}"
            if key in override:
                p["default"] = override[key]
            out.append(p)
    return out


def load_descriptor(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "name", "vendor", "category", "vst3_uid", "parameters"):
        if key not in data:
            raise SystemExit(f"descriptor missing '{key}': {path}")
    if len(data["vst3_uid"]) != 4:
        raise SystemExit("vst3_uid must have 4 hex words")
    data = dict(data)
    flat = expand_bands(data)
    data["parameters"] = with_standard_io_gains(flat)
    data["band_count"] = int((data.get("bands") or {}).get("count") or 0)
    data["params_per_band"] = (
        len((data.get("bands") or {}).get("params") or []) if data["band_count"] else 0
    )
    return data


def gen_cpp(desc: dict[str, Any], ns: str) -> str:
    uid = desc["vst3_uid"]
    params = desc["parameters"]
    editor = desc.get("editor") or {}
    width = int(editor.get("width", 360))
    height = int(editor.get("height", 420))
    # SPA shell + hash route (plugin id). Optional editor.entry overrides fully.
    entry = editor.get("entry") or f"index.html#{desc['id']}"
    band_count = int(desc.get("band_count") or 0)
    params_per_band = int(desc.get("params_per_band") or 0)

    enum_lines = []
    for i, p in enumerate(params):
        enum_lines.append(f"  {param_enum_name(p['id'])} = {i},")

    reg_lines = []
    for p in params:
        ptype = p.get("type", "float")
        enum = param_enum_name(p["id"])
        if ptype != "float":
            raise SystemExit(f"unsupported parameter type for codegen yet: {ptype}")
        unit = p.get("unit") or ""
        prec = int(p.get("precision", 1))
        flags_extra = ""
        if p["id"] == "bypass":
            flags_extra = (
                "\n    p->getInfo().flags |= Steinberg::Vst::ParameterInfo::kIsBypass;"
            )
        reg_lines.append(
            f"""  {{
    auto* p = new Steinberg::Vst::RangeParameter(
      STR16("{p['name']}"), {enum}, STR16("{unit}"),
      {float(p['min'])}, {float(p['max'])}, {float(p['default'])});
    p->setPrecision({prec});{flags_extra}
    parameters.addParameter(p);
  }}"""
        )

    enum_block = ""
    if enum_lines:
        enum_block = f"""
enum : Steinberg::Vst::ParamID
{{
{chr(10).join(enum_lines)}
}};
"""

    band_helpers = ""
    if band_count > 0 and params_per_band > 0:
        # First band param is b01_active after in/out/bypass…
        first_band_id = next(p["id"] for p in params if p["id"].startswith("b01_"))
        band_tmpl = (desc.get("bands") or {}).get("params") or []
        offset_enums = []
        for i, tmpl in enumerate(band_tmpl):
            parts = str(tmpl["id"]).split("_")
            enum_name = "kBand" + "".join(p.capitalize() for p in parts)
            offset_enums.append(f"  {enum_name} = {i},")
        band_helpers = f"""
static constexpr Steinberg::int32 kEqBandCount = {band_count};
static constexpr Steinberg::int32 kParamsPerBand = {params_per_band};
static constexpr Steinberg::Vst::ParamID kParamBandBase = {param_enum_name(first_band_id)};

enum : Steinberg::int32
{{
{chr(10).join(offset_enums)}
}};

inline Steinberg::Vst::ParamID bandParam(Steinberg::int32 band, Steinberg::int32 offset)
{{
  return static_cast<Steinberg::Vst::ParamID>(
    static_cast<Steinberg::int32>(kParamBandBase) + band * kParamsPerBand + offset);
}}
"""

    return f"""#pragma once
// Generated from {desc['id']}.plugin.json — do not edit.

#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ustring.h"
#include "pluginterfaces/vst/vsttypes.h"
#include "public.sdk/source/vst/vstparameters.h"

namespace calfNXT {{
namespace {ns} {{

static const Steinberg::FUID kPluginUID({uid[0]}, {uid[1]}, {uid[2]}, {uid[3]});

static constexpr const char* kPluginName = "{desc['name']}";
static constexpr const char* kPluginCategory = "{desc['category']}";
static constexpr const char* kEditorHtml = "{entry}";
static constexpr Steinberg::int32 kEditorWidth = {width};
static constexpr Steinberg::int32 kEditorHeight = {height};
{enum_block}
static constexpr Steinberg::int32 kParamCount = {len(params)};
{band_helpers}
inline void registerParameters(Steinberg::Vst::ParameterContainer& parameters)
{{
{chr(10).join(reg_lines) if reg_lines else "  (void)parameters;"}
}}

}} // namespace {ns}
}} // namespace calfNXT
"""


def gen_ts_model(desc: dict[str, Any]) -> str:
    params = desc["parameters"]
    editor = desc.get("editor") or {}
    editor_width = int(editor.get("width", 360))
    editor_height = int(editor.get("height", 420))
    band_count = int(desc.get("band_count") or 0)
    params_per_band = int(desc.get("params_per_band") or 0)
    fields = []
    create_lines = []
    id_map = []
    for i, p in enumerate(params):
        pid = p["id"]
        fields.append(f"  {pid}$: DynamicValue<number>;")
        create_lines.append(
            f"    {pid}$: DynamicValue.fromConstant({float(p['default'])}),"
        )
        id_map.append(f"    {pid}: {i},")

    meta_params = []
    for p in params:
        meta_params.append(
            "    "
            + json.dumps(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "type": p.get("type", "float"),
                    "unit": p.get("unit", ""),
                    "min": p.get("min"),
                    "max": p.get("max"),
                    "default": p.get("default"),
                    "scale": p.get("scale", "linear"),
                    "precision": p.get("precision", 1),
                },
                separators=(",", ":"),
            )
            + ","
        )

    dv_import = (
        'import { DynamicValue } from "@deutschesoft/awml";\n'
        if params
        else ""
    )

    band_ts = ""
    if band_count > 0 and params_per_band > 0:
        first = next(i for i, p in enumerate(params) if p["id"].startswith("b01_"))
        band_tmpl = (desc.get("bands") or {}).get("params") or []
        offset_ts = ",\n".join(
            f'  {tmpl["id"]}: {i}' for i, tmpl in enumerate(band_tmpl)
        )
        band_ts = f"""
export const EQ_BAND_COUNT = {band_count} as const;
export const EQ_PARAMS_PER_BAND = {params_per_band} as const;
export const EQ_BAND_PARAM_BASE = {first} as const;

export const EQ_BAND_OFFSET = {{
{offset_ts},
}} as const;

export function bandParamId(bandIndex: number, offset: number): number {{
  return EQ_BAND_PARAM_BASE + bandIndex * EQ_PARAMS_PER_BAND + offset;
}}
"""

    return f"""/* Generated from {desc['id']}.plugin.json — do not edit. */
{dv_import}
export const pluginMeta = {{
  id: {json.dumps(desc['id'])},
  name: {json.dumps(desc['name'])},
  vendor: {json.dumps(desc['vendor'])},
  version: {json.dumps(desc.get('version', '0.0.0'))},
  editor: {{ width: {editor_width}, height: {editor_height} }},
  parameters: [
{chr(10).join(meta_params)}
  ] as const,
}};

export const paramIds = {{
{chr(10).join(id_map)}
}} as const;
{band_ts}
export type {camel(desc['id'])}Model = {{
{chr(10).join(fields)}
}};

export function create{camel(desc['id'])}Model(): {camel(desc['id'])}Model {{
  return {{
{chr(10).join(create_lines)}
  }};
}}
"""


def update_registry(registry_path: Path, desc: dict[str, Any]) -> None:
    registry: dict[str, Any] = {"plugins": []}
    if registry_path.exists():
        try:
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            registry = {"plugins": []}
    plugins = [p for p in registry.get("plugins", []) if p.get("id") != desc["id"]]
    plugins.append(
        {
            "id": desc["id"],
            "name": desc["name"],
            "vendor": desc["vendor"],
            "version": desc.get("version", "0.0.0"),
            "category": desc["category"],
            "descriptor": f"dsp/{desc['id']}/{desc['id']}.plugin.json",
            "parameters": [
                {"id": p["id"], "name": p["name"], "type": p.get("type", "float")}
                for p in desc["parameters"]
            ],
        }
    )
    plugins.sort(key=lambda p: p["id"])
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps({"plugins": plugins}, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--descriptor", type=Path, required=True)
    ap.add_argument("--cpp-out", type=Path, required=True)
    ap.add_argument("--ts-out", type=Path, required=True)
    ap.add_argument("--registry-out", type=Path, required=True)
    ap.add_argument("--namespace", default=None, help="C++ namespace (default: CamelCase id)")
    args = ap.parse_args()

    desc = load_descriptor(args.descriptor)
    ns = args.namespace or camel(desc["id"])

    args.cpp_out.parent.mkdir(parents=True, exist_ok=True)
    args.cpp_out.write_text(gen_cpp(desc, ns), encoding="utf-8")

    args.ts_out.parent.mkdir(parents=True, exist_ok=True)
    args.ts_out.write_text(gen_ts_model(desc), encoding="utf-8")

    update_registry(args.registry_out, desc)
    print(f"generated {args.cpp_out}", file=sys.stderr)
    print(f"generated {args.ts_out}", file=sys.stderr)
    print(f"updated {args.registry_out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
