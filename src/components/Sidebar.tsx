import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { 
  Crown, Megaphone, Film, Briefcase, 
  BarChart3, FolderKanban, CheckSquare, Share2, 
  Users, Shield, Settings, ListTodo, MessageSquare, 
  User, PlusCircle, CheckCheck, ChevronLeft, ChevronRight,
  LogOut, Layers, X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  pendingApprovalsCount?: number;
  availableTasksCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  mobileOpen = false,
  setMobileOpen = () => {},
  pendingApprovalsCount = 0,
  availableTasksCount = 0,
}) => {
  const { currentUser, role, signOut } = useAuth();

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'founder':
        return { label: 'Founder', icon: <Crown className="w-3.5 h-3.5 text-white" />, color: 'bg-zinc-800 text-white border-zinc-700' };
      case 'social_media_manager':
        return { label: 'SMM Manager', icon: <Megaphone className="w-3.5 h-3.5 text-white" />, color: 'bg-zinc-800 text-white border-zinc-700' };
      case 'editor':
        return { label: 'Video Editor', icon: <Film className="w-3.5 h-3.5 text-white" />, color: 'bg-zinc-800 text-white border-zinc-700' };
      case 'client':
        return { label: 'Client Partner', icon: <Briefcase className="w-3.5 h-3.5 text-white" />, color: 'bg-zinc-800 text-white border-zinc-700' };
      default:
        return { label: 'Member', icon: <User className="w-3.5 h-3.5 text-white" />, color: 'bg-zinc-800 text-white border-zinc-700' };
    }
  };

  const getNavItems = (): NavItem[] => {
    switch (role) {
      case 'founder':
        return [
          { id: 'dashboard', label: 'KPI Analytics', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
          { id: 'editing', label: 'Production Board', icon: <Layers className="w-4 h-4" /> },
          { id: 'approvals', label: 'Founder Approvals', icon: <CheckCheck className="w-4 h-4" />, badge: pendingApprovalsCount },
          { id: 'published', label: 'SMM Publishing', icon: <Share2 className="w-4 h-4" /> },
          { id: 'clients', label: 'Clients & Channels', icon: <Briefcase className="w-4 h-4" /> },
          { id: 'team', label: 'Team & Invitations', icon: <Users className="w-4 h-4" /> },
          { id: 'audit', label: 'Audit Logs', icon: <Shield className="w-4 h-4" /> },
          { id: 'settings', label: 'Studio Settings', icon: <Settings className="w-4 h-4" /> },
        ];
      case 'social_media_manager':
        return [
          { id: 'dashboard', label: 'SMM Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
          { id: 'footage', label: 'Shoots & Tasks', icon: <PlusCircle className="w-4 h-4" /> },
          { id: 'pipeline', label: 'Production Board', icon: <Layers className="w-4 h-4" /> },
          { id: 'approvals', label: 'SMM Approvals', icon: <CheckCheck className="w-4 h-4" />, badge: pendingApprovalsCount },
          { id: 'publishing', label: 'Social Publishing', icon: <Share2 className="w-4 h-4" /> },
          { id: 'clients', label: 'Clients & Channels', icon: <Briefcase className="w-4 h-4" /> },
          { id: 'team', label: 'Team & Invitations', icon: <Users className="w-4 h-4" /> },
          { id: 'settings', label: 'Channel Settings', icon: <Settings className="w-4 h-4" /> },
        ];
      case 'editor':
        return [
          { id: 'tasks', label: 'Available Tasks', icon: <ListTodo className="w-4 h-4" />, badge: availableTasksCount },
          { id: 'my_tasks', label: 'My Active Editing', icon: <CheckSquare className="w-4 h-4" /> },
          { id: 'feedback', label: 'Revision Feedback', icon: <MessageSquare className="w-4 h-4" /> },
          { id: 'profile', label: 'Editor Profile', icon: <User className="w-4 h-4" /> },
        ];
      case 'client':
        return [
          { id: 'portal_overview', label: 'Brand Deliverables', icon: <Layers className="w-4 h-4" /> },
          { id: 'portal_approvals', label: 'Pending Approvals', icon: <CheckCheck className="w-4 h-4" />, badge: pendingApprovalsCount },
          { id: 'portal_published', label: 'Published Posts', icon: <Share2 className="w-4 h-4" /> },
          { id: 'portal_channels', label: 'Connected Channels', icon: <Settings className="w-4 h-4" /> },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();
  const roleBadge = getRoleBadge(role);

  return (
    <>
      {/* =========================================================================
          1. DESKTOP SIDEBAR (Visible only on md: screens and above)
          ========================================================================= */}
      <aside
        className={`hidden md:flex relative z-20 flex-col bg-zinc-950 border-r border-zinc-800/80 transition-all duration-300 select-none ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shrink-0">
              <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain" />
            </div>
            {!collapsed && (
              <div className="leading-tight truncate">
                <span className="font-black text-sm tracking-[0.16em] uppercase text-white block">
                  Digital Inertia
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
                  Workflow SaaS
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Role Indicator Card */}
        {!collapsed ? (
          <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${roleBadge.color}`}>
                {roleBadge.icon}
                {roleBadge.label}
              </span>
            </div>
            <div className="text-xs text-zinc-300 font-semibold truncate mt-1.5">
              {currentUser?.full_name || 'Studio Member'}
            </div>
            <div className="text-[11px] text-zinc-500 truncate">
              {currentUser?.email}
            </div>
          </div>
        ) : (
          <div className="py-3 flex justify-center border-b border-zinc-800/60" title={`${roleBadge.label}: ${currentUser?.email}`}>
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white">
              {roleBadge.icon}
            </div>
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all relative group ${
                  isActive
                    ? 'bg-white text-black shadow-lg font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <span className={`shrink-0 ${isActive ? 'text-black' : 'text-zinc-400 group-hover:text-white'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}

                {/* Counter Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                      isActive ? 'bg-black text-white' : 'bg-white text-black'
                    } ${collapsed ? 'absolute -top-1 -right-1' : ''}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer / Sign Out */}
        <div className="p-3 border-t border-zinc-800/80">
          <button
            onClick={() => signOut()}
            title={collapsed ? 'Sign Out' : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* =========================================================================
          2. MOBILE SLIDE-OVER DRAWER (Visible ONLY when mobileOpen is true)
          Closes completely on backdrop tap, ✕ tap, or selecting any navigation tab
          ========================================================================= */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          {/* Dark Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative z-10 w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-250 select-none">
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shrink-0">
                  <img src="/logo.png" alt="Digital Inertia" className="w-full h-full object-contain" />
                </div>
                <div className="leading-tight truncate">
                  <span className="font-black text-xs tracking-[0.16em] uppercase text-white block">
                    Digital Inertia
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">
                    All Options &amp; Menu
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 active:scale-90 transition"
                title="Close Sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Info Card */}
            <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${roleBadge.color}`}>
                  {roleBadge.icon}
                  {roleBadge.label}
                </span>
              </div>
              <div className="text-xs text-white font-bold truncate mt-1.5">
                {currentUser?.full_name || 'Studio Member'}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {currentUser?.email}
              </div>
            </div>

            {/* Navigation Items (All Options) */}
            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
              <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                Navigation Options
              </div>
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileOpen(false); // Closes completely when clicked
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
                      isActive
                        ? 'bg-white text-black shadow-lg font-black'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900 active:scale-[0.98]'
                    }`}
                  >
                    <span className={`shrink-0 ${isActive ? 'text-black' : 'text-zinc-400'}`}>
                      {item.icon}
                    </span>
                    <span className="truncate flex-1 text-left">{item.label}</span>

                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                          isActive ? 'bg-black text-white' : 'bg-white text-black'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Drawer Footer / Sign Out */}
            <div className="p-3 border-t border-zinc-800/80 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-zinc-950">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-900 transition active:scale-[0.98]"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
