import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ServerConfigModal } from './ServerConfigModal';
import { 
  Crown, Film, Megaphone, Settings, LogOut, Moon, Sun, 
  BarChart3, LayoutGrid, CheckCheck, Send, MoreHorizontal, 
  CheckSquare, HardDrive, MessageSquare, User, PlusCircle, 
  CheckCircle, History, ListTodo 
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
        return { title: 'Founder', icon: <Crown className="w-3.5 h-3.5" />, badge: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'editor':
        return { title: 'Video Editor', icon: <Film className="w-3.5 h-3.5" />, badge: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'social_media_manager':
        return { title: 'Social Media Manager', icon: <Megaphone className="w-3.5 h-3.5" />, badge: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
    }
  };

  const roleInfo = getRoleInfo();

  return (
    <>
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shadow-md overflow-hidden shrink-0">
              <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-[0.16em] uppercase text-white">
                  Digital Inertia
                </span>
                <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${roleInfo.badge}`}>
                  {roleInfo.icon}
                  {roleInfo.title}
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 hidden sm:block font-semibold">
                Studio DiskFlow
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowConfig(true)}
              className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              title="Supabase Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="text-right">
                <div className="text-xs font-bold text-zinc-200 truncate max-w-[120px]">
                  {currentUser?.full_name || 'User'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">
                  {currentUser?.email}
                </div>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1"
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
          { id: 'dashboard', label: 'Overview', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'production', label: 'Production', icon: <LayoutGrid className="w-5 h-5" /> },
          { id: 'more', label: 'Settings', icon: <MoreHorizontal className="w-5 h-5" /> },
        ];
      case 'editor':
        return [
          { id: 'tasks', label: 'Tasks', icon: <ListTodo className="w-5 h-5" /> },
          { id: 'my_tasks', label: 'My Tasks', icon: <CheckSquare className="w-5 h-5" /> },
          { id: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-5 h-5" /> },
          { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
        ];
      case 'social_media_manager':
        return [
          { id: 'dashboard', label: 'Hub', icon: <BarChart3 className="w-5 h-5" /> },
          { id: 'footage', label: 'Footage', icon: <PlusCircle className="w-5 h-5" /> },
          { id: 'pipeline', label: 'Editing', icon: <Film className="w-5 h-5" /> },
          { id: 'approvals', label: 'Approvals', icon: <CheckCheck className="w-5 h-5" /> },
        ];
    }
  };

  const tabs = getTabs();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-xl border-t border-zinc-800/80 pb-safe">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all relative ${
                isActive
                  ? 'text-white font-black scale-105'
                  : 'text-zinc-500 hover:text-zinc-300 font-medium'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
