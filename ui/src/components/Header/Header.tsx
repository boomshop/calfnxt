import React, { useEffect, useMemo } from 'react';
import './Header.scss';
import { CalfNxtLogo } from '../CalfNxtLogo';
import { Button, Buttons, Knob, MenuButton, MultiMeter, Toggle } from '../../widgets';
import {
  createHeaderIo,
  ioGainMeta,
  labelsForChannelCount,
  type IHeaderIo,
} from '../../host/headerMeters';
import { showWidgetInfo$ } from '../../prefs/showWidgetInfo';
import {
  ACCENT_CLASSES,
  setThemeAccent,
  setThemeMode,
  themeAccent$,
  themeMode$,
  type ThemeAccent,
  type ThemeMode,
} from '../../prefs/theme';
import {
  setVizHz,
  syncVizHzToHost,
  VIZ_HZ_OPTIONS,
  vizHz$,
} from '../../prefs/vizHz';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';

export interface HeaderProps {
  title?: string;
  /** Optional shared I/O model; defaults to a fresh silence/io model. */
  io?: IHeaderIo;
}

const MODE_ENTRIES: { value: ThemeMode; icon: string }[] = [
  { value: 'night', icon: 'night' },
  { value: 'day', icon: 'day' },
];

const HZ_ENTRIES = VIZ_HZ_OPTIONS.map((hz) => ({
  label: String(hz),
  value: hz,
}));

export function Header(props: React.PropsWithChildren<HeaderProps>) {
  const { children, title, io: ioProp } = props;
  const external = ioProp;

  const ownedIo = useMemo(
    () => (external ? null : createHeaderIo(2)),
    [external],
  );
  useEffect(() => () => ownedIo?.dispose(), [ownedIo]);
  useEffect(() => {
    syncVizHzToHost();
  }, []);

  const io = external ?? ownedIo!;
  const inputChannelCount = useDynamicValueReadonly(io.inputChannelCount$, 2);
  const outputChannelCount = useDynamicValueReadonly(io.outputChannelCount$, 2);
  const inLabels = labelsForChannelCount(inputChannelCount);
  const outLabels = labelsForChannelCount(outputChannelCount);
  const themeMode = useDynamicValueReadonly<ThemeMode>(themeMode$, 'night');
  const themeAccent = useDynamicValueReadonly<ThemeAccent>(
    themeAccent$,
    'calfnxt',
  );
  const vizHz = useDynamicValueReadonly(vizHz$, 30);

  return (
    <div className="Header">
      <CalfNxtLogo className="logo" />
      {title ? <div className="title">{title}</div> : null}

      <div className="in io" data-io="in">
        <span className="tag">In</span>
        <Knob
          className="gain"
          size="small"
          value$={io.inGain$}
          beginEdit={io.beginInGainEdit}
          endEdit={io.endInGainEdit}
          min={ioGainMeta.min}
          max={ioGainMeta.max}
          reset={ioGainMeta.default}
          label={false}
          base={0}
          scale="decibel"
          log_factor={3}
        />
        <MultiMeter
          value$={io.levelIn$}
          count$={io.inputChannelCount$}
          labels={inLabels}
          layout="top"
        />
      </div>

      <div className="children">{children}</div>

      <div className="out io" data-io="out">
        <MultiMeter
          value$={io.levelOut$}
          count$={io.outputChannelCount$}
          labels={outLabels}
          layout="top"
        />
        <Knob
          className="gain"
          size="small"
          value$={io.outGain$}
          beginEdit={io.beginOutGainEdit}
          endEdit={io.endOutGainEdit}
          min={ioGainMeta.min}
          max={ioGainMeta.max}
          reset={ioGainMeta.default}
          label={false}
          base={0}
          scale="decibel"
          log_factor={3}
        />
        <span className="tag">Out</span>
      </div>

      <Toggle
        className="widget-info"
        state$={showWidgetInfo$}
        icon="info"
        title="Show parameter info icons"
      />

      <MenuButton icon="show" className="topmenu" anchor="top-right">
        <div className="Header-prefs">
          <div className="prefs-row">
            <span className="prefs-label">Theme</span>
            <Buttons
              className="prefs-mode"
              layout="horizontal"
              entries={MODE_ENTRIES}
              value={themeMode}
              onChange={(m) => setThemeMode(m as ThemeMode)}
            />
          </div>
          <div className="prefs-row">
            <span className="prefs-label">Color</span>
            <div className="prefs-accent" role="group" aria-label="Accent color">
              {ACCENT_CLASSES.map((accent) => (
                <Button
                  key={accent}
                  icon="gear"
                  label={false}
                  className={`accent-swatch accent-${accent}`}
                  state={themeAccent === accent}
                  title={accent}
                  onClick={() => setThemeAccent(accent)}
                />
              ))}
            </div>
          </div>
          <div className="prefs-row">
            <span className="prefs-label" title="UI meter/chart refresh rate">
              UI Hz
            </span>
            <Buttons
              className="prefs-hz"
              layout="horizontal"
              entries={HZ_ENTRIES}
              value={Math.round(vizHz)}
              onChange={(hz) => setVizHz(hz as number)}
            />
          </div>
        </div>
      </MenuButton>
    </div>
  );
}
