import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar, BottomNav } from './components/NavigationBars';
import { AuthView } from './views/AuthView';
import { FounderDashboard } from './views/FounderDashboard';
import { FounderApprovals } from './views/FounderApprovals';
import { ProductionBoard } from './views/ProductionBoard';
import { RecordingRegistration } from './views/RecordingRegistration';
import { EditorWorkspace } from './views/EditorWorkspace';
import { EditorFeedback } from './views/EditorFeedback';
import { SocialMediaPublishing } from './views/SocialMediaPublishing';
import { PublishingHistory } from './views/PublishingHistory';
import { FounderMore } from './views/FounderMore';

export const App: React.FC = () => {
  const { isAuthenticated, role, isLoading } = useAuth();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Set default tab when role changes
  useEffect(() => {
    if (role === 'founder') {
      setActiveTab('dashboard');
    } else if (role === 'editor') {
      setActiveTab('tasks');
    } else if (role === 'social_media_manager') {
      setActiveTab('footage');
    }
  }, [role]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Loading Studio DiskFlow...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  const renderActiveScreen = () => {
    if (role === 'founder') {
      switch (activeTab) {
        case 'dashboard':
          return <FounderDashboard onNavigateTab={setActiveTab} />;
        case 'production':
          return <ProductionBoard />;
        case 'approvals':
          return <FounderApprovals />;
        case 'publishing':
          return <SocialMediaPublishing />;
        case 'more':
          return <FounderMore />;
        default:
          return <FounderDashboard onNavigateTab={setActiveTab} />;
      }
    } else if (role === 'editor') {
      switch (activeTab) {
        case 'tasks':
        case 'recordings':
          return <EditorWorkspace />;
        case 'production':
          return <ProductionBoard />;
        case 'feedback':
          return <EditorFeedback />;
        case 'profile':
          return <FounderMore />;
        default:
          return <EditorWorkspace />;
      }
    } else if (role === 'social_media_manager') {
      switch (activeTab) {
        case 'dashboard':
          return <FounderDashboard onNavigateTab={setActiveTab} />;
        case 'footage':
          return <RecordingRegistration />;
        case 'approved':
        case 'publishing':
          return <SocialMediaPublishing />;
        case 'history':
          return <PublishingHistory />;
        default:
          return <RecordingRegistration />;
      }
    }

    return <FounderDashboard onNavigateTab={setActiveTab} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {renderActiveScreen()}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};
