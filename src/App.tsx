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
import { EditorProfile } from './views/EditorProfile';
import { SocialMediaPublishing } from './views/SocialMediaPublishing';
import { PublishingHistory } from './views/PublishingHistory';
import { FounderMore } from './views/FounderMore';
import { ManagerApprovals } from './views/ManagerApprovals';
import { ClientPortal } from './views/ClientPortal';

export const App: React.FC = () => {
  const { isAuthenticated, role, isLoading } = useAuth();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');

  useEffect(() => {
    document.documentElement.classList.add('dark');
    if (darkMode) {
      localStorage.setItem('theme', 'dark');
    } else {
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Set default tab when role changes
  useEffect(() => {
    if (role === 'founder') {
      setActiveTab('dashboard');
    } else if (role === 'editor') {
      setActiveTab('my_tasks');
    } else if (role === 'social_media_manager') {
      setActiveTab('dashboard');
    } else if (role === 'client') {
      setActiveTab('cuts');
    }
  }, [role]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Loading Digital Inertia...</span>
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
        case 'approvals':
          return <FounderApprovals />;
        case 'production':
          return <ProductionBoard />;
        case 'more':
          return <FounderMore />;
        default:
          return <FounderDashboard onNavigateTab={setActiveTab} />;
      }
    } else if (role === 'editor') {
      switch (activeTab) {
        case 'tasks':
          return <EditorWorkspace mode="all" onNavigateTab={setActiveTab} />;
        case 'my_tasks':
          return <EditorWorkspace mode="my" onNavigateTab={setActiveTab} />;
        case 'feedback':
          return <EditorFeedback />;
        case 'profile':
          return <EditorProfile />;
        default:
          return <EditorWorkspace mode="my" onNavigateTab={setActiveTab} />;
      }
    } else if (role === 'social_media_manager') {
      switch (activeTab) {
        case 'dashboard':
          return <FounderDashboard onNavigateTab={setActiveTab} />;
        case 'footage':
          return <RecordingRegistration />;
        case 'pipeline':
          return <ProductionBoard />;
        case 'approvals':
        case 'approved':
        case 'publishing':
          return <ManagerApprovals />;
        case 'history':
          return <PublishingHistory />;
        default:
          return <FounderDashboard onNavigateTab={setActiveTab} />;
      }
    } else if (role === 'client') {
      return <ClientPortal activeTab={activeTab} onNavigateTab={setActiveTab} />;
    }

    return <FounderDashboard onNavigateTab={setActiveTab} />;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-black">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {renderActiveScreen()}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};
