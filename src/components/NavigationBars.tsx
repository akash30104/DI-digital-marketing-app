import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ServerConfigModal } from './ServerConfigModal';
import { 
  Crown, Film, Megaphone, Settings, LogOut, Moon, Sun, 
  BarChart3, LayoutGrid, CheckCheck, Send, MoreHorizontal, 
  CheckSquare, HardDrive, MessageSquare, User, PlusCircle, 
  CheckCircle, History 
} from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode }) => {
  const { currentUser, role, signOut } = useAuth();
  const [showConfig, setShowConfig] = useState(false);

  const getRoleInfo = () => {
    switch (role) {
      case 'founder':
        return { title: 'Founder', icon: <Crown className="w-3.5 h-3.5" />, badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' };
      case 'editor':
        return { title: 'Video Editor', icon: <Film className="w-3.5 h-3.5" />, badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20' };
      case 'social_media_manager':
        return { title: 'Social Media Manager', icon: <Megaphone className="w-3.5 h-3.5" />, badge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20' };
    }
  };

  const roleInfo = getRoleInfo();

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-navy to-brand-blue flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-wider uppercase text-brand-navy dark:text-white">
                  Studio DiskFlow
                </span>
                <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleInfo.badge}`}>
                  {roleInfo.icon}
                  {roleInfo.title}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Native Video Production & Social Publishing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowConfig(true)}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Supabase Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {currentUser?.full_name || 'User'}
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {currentUser?.email}
                </div>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors ml-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <ServerConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} />
    </>
  );
};

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { role } = useAuth();

  const getTabs = () => {
    switch (role) {
      case 'founder':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'production', label: 'Production', icon: <LayoutGrid className="w-5 h-5" /> },
          { id: 'approvals', label: 'Approvals', icon: <CheckCheck className="w-5 h-5" /> },
          { id: 'publishing', label: 'Publishing', icon: <Send className="w-5 h-5" /> },
          { id: 'more', label: 'More', icon: <MoreHorizontal className="w-5 h-5" /> },
        ];
      case 'editor':
        return [
          { id: 'tasks', label: 'My Tasks', icon: <CheckSquare className="w-5 h-5" /> },
          { id: 'recordings', label: 'Recordings', icon: <HardDrive className="w-5 h-5" /> },
          { id: 'production', label: 'Board', icon: <Film className="w-5 h-5" /> },
          { id: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-5 h-5" /> },
          { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
        ];
      case 'social_media_manager':
        return [
          { id: 'dashboard', label: 'Hub', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'footage', label: 'Footage', icon: <PlusCircle className="w-5 h-5" /> },
          { id: 'approved', label: 'Approved', icon: <CheckCircle className="w-5 h-5" /> },
          { id: 'publishing', label: 'Publishing', icon: <Send className="w-5 h-5" /> },
          { id: 'history', label: 'History', icon: <History className="w-5 h-5" /> },
        ];
    }
  };

  const tabs = getTabs();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800 pb-safe">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors relative ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
