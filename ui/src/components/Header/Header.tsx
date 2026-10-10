import React, { useEffect, useMemo } from 'react';
import './Header.scss';
import { CalfNxtLogo } from '../CalfNxtLogo';
import {
  Button,
  Buttons,
  Knob,
  MenuButton,
  MultiMeter,
  Toggle,
  WithInfo,
} from '../../widgets';
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
import {
  ardourGuiTipDismissed$,
  ardourGuiTipVisible$,
} from '../../prefs/ardourGuiTip';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { headerInfo } from './headerInfo';

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
  const showArdourTip = useDynamicValueReadonly(ardourGuiTipVisible$, false);

  return (
    <div className="Header">
      <CalfNxtLogo className="logo" />
      {title ? <div className="title">{title}</div> : null}

      <div className="in io" data-io="in">
        <span className="tag">In</span>
        <WithInfo title={headerInfo.inGain}>
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
        </WithInfo>
        <MultiMeter
          value$={io.levelIn$}
          count$={io.inputChannelCount$}
          labels={inLabels}
          layout="top"
          show_clip={[true, true]}
          auto_clip={[5000, 5000]}
          clipping={[0.000001, 0.000001]}
        />
      </div>

      <div className="children">{children}</div>

      <div className="out io" data-io="out">
        <MultiMeter
          value$={io.levelOut$}
          count$={io.outputChannelCount$}
          labels={outLabels}
          layout="top"
          show_clip={[true, true]}
          auto_clip={[5000, 5000]}
          clipping={[0.000001, 0.000001]}
        />
        <WithInfo title={headerInfo.outGain}>
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
        </WithInfo>
        <span className="tag">Out</span>
      </div>

      {showArdourTip ? (
        <MenuButton
          icon="warning"
          className="ardour-tip"
          anchor="top-right"
          closeOnMenuClick={false}
          title="Ardour UI setting — click for details">
          <div
            className="Header-ardour-tip"
            onClick={(e) => e.stopPropagation()}>
            <div className="tip-title">
              Ardour is parking this editor in RAM
            </div>
            <p>
              Closing a plugin window in Ardour normally only hides it. The
              window comes back fast, but calfNXT’s embedded UI (GTK3 / XEmbed)
              stays alive in the background — often dozens or even hundreds of
              MB of RAM per open plugin — until you remove the plugin or change
              the preference below.
            </p>
            <p>
              That setting tells Ardour to destroy VST UIs on close so we get a
              proper teardown and the helper process can exit.
            </p>
            <ol>
              <li>
                <strong>Edit</strong> → <strong>Preferences</strong>
              </li>
              <li>
                Open <strong>Plugins</strong> → <strong>GUI</strong>
              </li>
              <li>
                Find <strong>Closing a Plugin GUI Window</strong>
              </li>
              <li>
                Choose <strong>only destroys VST2/3 UIs, hides others</strong>
                <span className="tip-alt">
                  {' '}
                  (or{' '}
                  <strong>
                    destroys the GUI instance, releasing resources
                  </strong>
                  )
                </span>
              </li>
              <li>
                Close this window and open it again — the helper should quit
                cleanly when you close the UI.
              </li>
            </ol>
            <label className="tip-dismiss">
              <Toggle
                state$={ardourGuiTipDismissed$}
                className="tip-dismiss-toggle"
                icon="close"
              />
              <span>Don&apos;t show this again</span>
            </label>
          </div>
        </MenuButton>
      ) : null}

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
            <div
              className="prefs-accent"
              role="group"
              aria-label="Accent color">
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
