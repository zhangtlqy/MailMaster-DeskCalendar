// ========== Root App: read-only MailMaster desktop month calendar ==========

import React from 'react';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import MonthView from './components/MonthView/MonthView';
import { useTheme } from './hooks/useTheme';
import './App.css';

const App: React.FC = () => {
  useTheme();
  return <ErrorBoundary><MonthView /></ErrorBoundary>;
};

export default App;
