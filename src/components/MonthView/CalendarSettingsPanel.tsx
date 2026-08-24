import React from 'react';
import { X } from '@phosphor-icons/react';
import type { CalendarSettings } from '../../types/calendar-settings.types';

interface Props {
  settings: CalendarSettings;
  onChange: (patch: Partial<CalendarSettings>) => void;
  onClose: () => void;
}

const OFFSET_OPTIONS = [
  [-4, '本月首周之前 4 周'], [-3, '本月首周之前 3 周'], [-2, '本月首周之前 2 周'],
  [-1, '本月首周之前 1 周'], [0, '包含本月 1 日的周'], [1, '本月第 2 周'],
  [2, '本月第 3 周'], [3, '本月第 4 周'], [4, '本月第 5 周'],
] as const;

export const CalendarSettingsPanel: React.FC<Props> = ({ settings, onChange, onClose }) => (
  <aside className="calendar-settings" aria-label="日历设置">
    <div className="calendar-settings__header">
      <div><span>桌面日历</span><h2>显示设置</h2></div>
      <button onClick={onClose} aria-label="关闭设置" title="关闭设置"><X /></button>
    </div>

    <section>
      <h3>外观</h3>
      <label className="setting-row">
        <span><strong>窗口颜色</strong><small>{settings.backgroundColor.toUpperCase()}</small></span>
        <input type="color" value={settings.backgroundColor} onChange={(event) => onChange({ backgroundColor: event.target.value })} />
      </label>
      <label className="setting-slider">
        <span><strong>透明度</strong><output>{Math.round(settings.opacity * 100)}%</output></span>
        <input type="range" min="25" max="100" value={Math.round(settings.opacity * 100)}
          onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
      </label>
    </section>

    <section>
      <h3>窗口</h3>
      <label className="setting-row setting-toggle">
        <span><strong>固定位置和大小</strong><small>{settings.lockWindow ? '已锁定，无法拖动或缩放' : '拖动标题栏并调整到合适大小'}</small></span>
        <input type="checkbox" checked={settings.lockWindow} onChange={(event) => onChange({ lockWindow: event.target.checked })} />
      </label>
    </section>

    <section>
      <h3>日期范围</h3>
      <label className="setting-row">
        <span><strong>显示周数</strong><small>窗口中同时显示的周数</small></span>
        <select value={settings.visibleWeeks} onChange={(event) => onChange({ visibleWeeks: Number(event.target.value) })}>
          {Array.from({ length: 8 }, (_, index) => index + 1).map((week) => <option key={week} value={week}>{week} 周</option>)}
        </select>
      </label>
      <label className="setting-row">
        <span><strong>第 1 行对应</strong><small>相对于当前月份的起始周</small></span>
        <select value={settings.firstWeekOffset} onChange={(event) => onChange({ firstWeekOffset: Number(event.target.value) })}>
          {OFFSET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </section>
  </aside>
);
