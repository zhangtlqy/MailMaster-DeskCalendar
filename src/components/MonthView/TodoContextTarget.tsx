import React from 'react';
import type { MailMasterEvent } from '../../types';

interface Props extends Omit<React.HTMLAttributes<HTMLElement>, 'onContextMenu'> {
  event: MailMasterEvent;
  onContextMenu: (event: MailMasterEvent, x: number, y: number) => void;
  as?: 'article' | 'div';
}

export function TodoContextTarget({ event, onContextMenu, as: Tag = 'div', ...elementProps }: Props) {
  return <Tag {...elementProps} onContextMenu={(mouseEvent) => {
    if (!event.is_todo) return;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    onContextMenu(event, mouseEvent.clientX, mouseEvent.clientY);
  }} />;
}
