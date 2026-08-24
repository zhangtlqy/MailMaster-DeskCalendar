import React from 'react';
import { X } from '@phosphor-icons/react';
import type { CalendarSettings } from '../../types/calendar-settings.types';

interface Props {
  settings: CalendarSettings;
  onChange: (patch: Partial<CalendarSettings>) => void;
  onClose: () => void;
  onBrowseDatabase: () => void;
  onAutoDetectDatabase: () => void;
  databaseError: string | null;
  databaseSuccess: string | null;
  onCheckDatabase: () => void;
  onToggleAutoStart: (enabled: boolean) => void;
  autoStartError: string | null;
}

const OFFSET_OPTIONS = [
  [-4, '本月首周之前 4 周'], [-3, '本月首周之前 3 周'], [-2, '本月首周之前 2 周'],
  [-1, '本月首周之前 1 周'], [0, '包含本月 1 日的周'], [1, '本月第 2 周'],
  [2, '本月第 3 周'], [3, '本月第 4 周'], [4, '本月第 5 周'],
] as const;

export const CalendarSettingsPanel: React.FC<Props> = ({
  settings, onChange, onClose, onBrowseDatabase, onAutoDetectDatabase, databaseError,
  databaseSuccess, onCheckDatabase,
  onToggleAutoStart, autoStartError,
}) => (
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
        <input type="range" min="5" max="100" value={Math.round(settings.opacity * 100)}
          onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
      </label>
    </section>

    <section>
      <h3>文字</h3>
      <label className="setting-row setting-visual-row">
        <span><strong>月份标题</strong><small>颜色与字号</small></span>
        <span className="setting-visual-controls">
          <input aria-label="标题颜色" type="color" value={settings.titleColor} onChange={(event) => onChange({ titleColor: event.target.value })} />
          <input aria-label="标题字号" type="number" min="12" max="36" value={settings.titleFontSize} onChange={(event) => onChange({ titleFontSize: Number(event.target.value) })} />
        </span>
      </label>
      <label className="setting-row setting-visual-row">
        <span><strong>日期数字</strong><small>颜色与字号</small></span>
        <span className="setting-visual-controls">
          <input aria-label="日期颜色" type="color" value={settings.dateColor} onChange={(event) => onChange({ dateColor: event.target.value })} />
          <input aria-label="日期字号" type="number" min="10" max="30" value={settings.dateFontSize} onChange={(event) => onChange({ dateFontSize: Number(event.target.value) })} />
        </span>
      </label>
      <label className="setting-row setting-visual-row">
        <span><strong>单元格文字</strong><small>星期、农历与事项</small></span>
        <span className="setting-visual-controls">
          <input aria-label="单元格文字颜色" type="color" value={settings.cellTextColor} onChange={(event) => onChange({ cellTextColor: event.target.value })} />
          <input aria-label="单元格文字字号" type="number" min="9" max="24" value={settings.cellFontSize} onChange={(event) => onChange({ cellFontSize: Number(event.target.value) })} />
        </span>
      </label>
      <label className="setting-row">
        <span><strong>事项颜色标记</strong><small>事项背景保持透明</small></span>
        <select value={settings.eventMarkerStyle} onChange={(event) => onChange({ eventMarkerStyle: event.target.value as 'dot' | 'bar' })}>
          <option value="dot">圆点</option><option value="bar">竖线</option>
        </select>
      </label>
    </section>

    <section>
      <h3>日历数据</h3>
      <div className="database-path" title={settings.mailMasterDbPath || '使用自动检测路径'}>
        {settings.mailMasterDbPath || '自动检测：尚未指定自定义路径'}
      </div>
      {databaseError && <p className="database-path__error" role="alert">{databaseError}</p>}
      {databaseSuccess && <p className="database-path__success" role="status">{databaseSuccess}</p>}
      <div className="database-path__actions">
        <button type="button" onClick={onCheckDatabase}>检查读取</button>
        <button type="button" onClick={onAutoDetectDatabase}>自动检测</button>
        <button type="button" className="database-path__primary" onClick={onBrowseDatabase}>选择 calendar.db</button>
      </div>
    </section>

    <section>
      <h3>窗口</h3>
      <label className="setting-row setting-toggle">
        <span><strong>开机自动启动</strong><small>登录 Windows 后在桌面层启动日历</small></span>
        <input type="checkbox" checked={settings.autoStart} onChange={(event) => onToggleAutoStart(event.target.checked)} />
      </label>
      {autoStartError && <p className="database-path__error" role="alert">{autoStartError}</p>}
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
