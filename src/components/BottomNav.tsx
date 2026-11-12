import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart3, FolderKanban, Layers, CheckCheck, 
  Menu, CheckSquare, ListTodo, MessageSquare, 
  User, PlusCircle, Share2, Settings
} from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSideMenu: () => void;
  pendingApprovalsCount?: number;
  availableTasksCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenSideMenu,
  pendingApprovalsCount = 0,
  availableTasksCount = 0
}) => {
  const { role } = useAuth();

  interface NavButton {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    isMenuTrigger?: boolean;
  }

  const getRoleNavItems = (): NavButton[] => {
    switch (role) {
      case 'founder':
        return [
          { id: 'dashboard', label: 'KPI', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-5 h-5" /> },
          { id: 'editing', label: 'Board', icon: <Layers className="w-5 h-5" /> },
          { id: 'approvals', label: 'Approve', icon: <CheckCheck className="w-5 h-5" />, badge: pendingApprovalsCount },
          { id: 'more_menu', label: 'More', icon: <Menu className="w-5 h-5" />, isMenuTrigger: true }
        ];
      case 'social_media_manager':
        return [
          { id: 'dashboard', label: 'Hub', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-5 h-5" /> },
          { id: 'pipeline', label: 'Pipeline', icon: <Layers className="w-5 h-5" /> },
          { id: 'publishing', label: 'Publish', icon: <Share2 className="w-5 h-5" /> },
          { id: 'more_menu', label: 'More', icon: <Menu className="w-5 h-5" />, isMenuTrigger: true }
        ];
      case 'editor':
        return [
          { id: 'my_tasks', label: 'My Tasks', icon: <CheckSquare className="w-5 h-5" /> },
          { id: 'tasks', label: 'All Tasks', icon: <ListTodo className="w-5 h-5" />, badge: availableTasksCount },
          { id: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-5 h-5" /> },
          { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
          { id: 'more_menu', label: 'Menu', icon: <Menu className="w-5 h-5" />, isMenuTrigger: true }
        ];
      case 'client':
        return [
          { id: 'portal_overview', label: 'Videos', icon: <Layers className="w-5 h-5" /> },
          { id: 'portal_approvals', label: 'Review', icon: <CheckCheck className="w-5 h-5" />, badge: pendingApprovalsCount },
          { id: 'portal_published', label: 'Posts', icon: <Share2 className="w-5 h-5" /> },
          { id: 'portal_channels', label: 'Channels', icon: <Settings className="w-5 h-5" /> },
          { id: 'more_menu', label: 'Menu', icon: <Menu className="w-5 h-5" />, isMenuTrigger: true }
        ];
      default:
        return [
          { id: 'more_menu', label: 'Menu', icon: <Menu className="w-5 h-5" />, isMenuTrigger: true }
        ];
    }
  };

  const items = getRoleNavItems();

  return (
    <nav 
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] select-none"
    >
      <div className="grid grid-cols-5 h-14 max-w-md mx-auto items-center px-1">
        {items.map((item) => {
          const isActive = !item.isMenuTrigger && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.isMenuTrigger) {
                  onOpenSideMenu();
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-xl transition-all relative ${
                isActive 
                  ? 'text-white font-black scale-105' 
                  : 'text-zinc-500 hover:text-zinc-300 font-semibold active:scale-95'
              }`}
            >
              <div className="relative">
                <span className={`block transition-transform ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                  {item.icon}
                </span>

                {/* Badge indicator */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-3.5 bg-white text-black font-black text-[9px] rounded-full flex items-center justify-center shadow-md">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>

              <span className={`text-[10px] leading-tight truncate max-w-full tracking-tight ${
                isActive ? 'text-white font-black' : 'text-zinc-500'
              }`}>
                {item.label}
              </span>

              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute -bottom-1 w-4 h-0.5 bg-white rounded-full shadow-[0_0_8px_white]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
