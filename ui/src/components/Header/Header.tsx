import React, { useEffect, useMemo, useState } from 'react';
import './Header.scss';
import { CalfNxtLogo } from '../CalfNxtLogo';
import { Button, Knob, MenuButton, MultiMeter, Toggle } from '../../widgets';
import {
  createHeaderIo,
  ioGainMeta,
  labelsForChannelCount,
  type IHeaderIo,
} from '../../host/headerMeters';
import { showWidgetInfo$ } from '../../prefs/showWidgetInfo';
import {
  themeAccent$,
  themeMode$,
  toggleThemeAccent,
  toggleThemeMode,
  nextThemeAccent,
  type ThemeAccent,
  type ThemeMode,
} from '../../prefs/theme';
import type { DynamicValue } from '@deutschesoft/awml';

export interface HeaderProps {
  title?: string;
  /** Optional shared I/O model; defaults to a fresh silence/io model. */
  io?: IHeaderIo;
}

function useDynamicNumber(dv: DynamicValue<number>): number {
  const [v, setV] = useState(() => dv.value);
  useEffect(() => dv.subscribe(setV), [dv]);
  return v;
}

function useDynamicValue<T>(dv: DynamicValue<T>): T {
  const [v, setV] = useState(() => dv.value);
  useEffect(() => dv.subscribe(setV), [dv]);
  return v;
}

export function Header(props: React.PropsWithChildren<HeaderProps>) {
  const { children, title, io: ioProp } = props;
  const external = ioProp;

  const ownedIo = useMemo(
    () => (external ? null : createHeaderIo(2)),
    [external],
  );
  useEffect(() => () => ownedIo?.dispose(), [ownedIo]);

  const io = external ?? ownedIo!;
  const channelCount = useDynamicNumber(io.channelCount$);
  const labels = labelsForChannelCount(channelCount);
  const themeMode = useDynamicValue<ThemeMode>(themeMode$);
  const themeAccent = useDynamicValue<ThemeAccent>(themeAccent$);

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
          count$={io.channelCount$}
          labels={labels}
          layout="top"
        />
      </div>

      <div className="children">{children}</div>

      <div className="out io" data-io="out">
        <MultiMeter
          value$={io.levelOut$}
          count$={io.channelCount$}
          labels={labels}
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
        <Button
          icon={themeMode === 'day' ? 'day' : 'night'}
          label={false}
          title={themeMode === 'day' ? 'Switch to night' : 'Switch to day'}
          onClick={toggleThemeMode}
        />
        <Button
          icon="gear"
          label={false}
          className="theme-swatch"
          title={`Switch to ${nextThemeAccent(themeAccent)} accents`}
          onClick={toggleThemeAccent}
        />
      </MenuButton>
    </div>
  );
}
