import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
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
import { ClientsView } from './views/ClientsView';
import { PublishedVideosView } from './views/PublishedVideosView';
import { PrivacyPolicyView } from './views/PrivacyPolicyView';
import { ProjectsView } from './views/ProjectsView';
import { InvitationsView } from './views/InvitationsView';
import { AuditLogsView } from './views/AuditLogsView';
import { CreateTaskModal } from './components/CreateTaskModal';

export const App: React.FC = () => {
  const { isAuthenticated, role, isLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateTaskModal, setShowCreateTaskModal] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = (window.location.pathname || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    const search = (window.location.search || '').toLowerCase();
    return path.includes('privacy') || hash.includes('privacy') || search.includes('privacy');
  });

  // Set default tab when role changes
  useEffect(() => {
    if (role === 'founder') {
      setActiveTab('dashboard');
    } else if (role === 'editor') {
      setActiveTab('my_tasks');
    } else if (role === 'social_media_manager') {
      setActiveTab('pipeline');
    } else if (role === 'client') {
      setActiveTab('portal_overview');
    }
  }, [role]);

  if (showPrivacyPolicy) {
    return (
      <PrivacyPolicyView
        onBack={() => {
          setShowPrivacyPolicy(false);
          if (window.history && window.history.pushState) {
            window.history.pushState(null, '', '/');
          }
        }}
      />
    );
  }

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
    return <AuthView onShowPrivacy={() => setShowPrivacyPolicy(true)} />;
  }

  const renderActiveScreen = () => {
    if (role === 'founder') {
      switch (activeTab) {
        case 'dashboard':
          return <FounderDashboard onNavigateTab={setActiveTab} />;
        case 'projects':
          return <ProjectsView onNavigateTab={setActiveTab} />;
        case 'editing':
        case 'production':
          return <ProductionBoard onNavigateTab={setActiveTab} />;
        case 'approvals':
          return <FounderApprovals />;
        case 'published':
          return <PublishedVideosView canEditInsights={true} />;
        case 'clients':
          return <ClientsView onNavigateTab={setActiveTab} />;
        case 'team':
          return <InvitationsView />;
        case 'audit':
          return <AuditLogsView />;
        case 'more':
        case 'settings':
          return <FounderMore onNavigateTab={setActiveTab} />;
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
        case 'hub':
          return <FounderDashboard onNavigateTab={setActiveTab} />;
        case 'projects':
          return <ProjectsView onNavigateTab={setActiveTab} />;
        case 'footage':
          return <RecordingRegistration onNavigateTab={setActiveTab} />;
        case 'pipeline':
        case 'editing':
          return <ProductionBoard onNavigateTab={setActiveTab} />;
        case 'approvals':
        case 'approved':
          return <ManagerApprovals />;
        case 'publishing':
        case 'published':
          return <SocialMediaPublishing />;
        case 'clients':
          return <ClientsView onNavigateTab={setActiveTab} />;
        case 'team':
          return <InvitationsView />;
        case 'history':
          return <PublishingHistory />;
        case 'settings':
        case 'more':
          return <FounderMore onNavigateTab={setActiveTab} />;
        default:
          return <ProductionBoard onNavigateTab={setActiveTab} />;
      }
    } else if (role === 'client') {
      // Map portal subtabs for client
      const mappedPortalTab = 
        activeTab === 'portal_approvals' ? 'approvals' :
        activeTab === 'portal_published' ? 'published' :
        activeTab === 'portal_channels' ? 'settings' : 'editing';

      return <ClientPortal activeTab={mappedPortalTab} onNavigateTab={(tab) => {
        if (tab === 'approvals') setActiveTab('portal_approvals');
        else if (tab === 'published') setActiveTab('portal_published');
        else if (tab === 'settings') setActiveTab('portal_channels');
        else setActiveTab('portal_overview');
      }} />;
    }

    return <ProductionBoard />;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex font-sans selection:bg-white selection:text-black">
      {/* Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onSearchChange={setSearchQuery}
          onNavigateTab={setActiveTab}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 max-w-7xl w-full mx-auto">
          {renderActiveScreen()}
        </main>
      </div>

      {/* SMM / Founder Quick Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        onTaskCreated={() => {
          if (activeTab === 'editing' || activeTab === 'pipeline') {
            window.location.reload();
          }
        }}
      />
    </div>
  );
};
