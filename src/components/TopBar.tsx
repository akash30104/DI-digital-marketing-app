import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, NotificationItem } from '../types';
import { getInAppNotifications, markNotificationAsRead } from '../lib/api';
import { 
  Search, Bell, Check, CheckCheck, Crown, 
  Megaphone, Film, Briefcase, ChevronDown, User, 
  ExternalLink, Sparkles
} from 'lucide-react';

interface TopBarProps {
  onSearchChange?: (query: string) => void;
  onNavigateTab?: (tab: string) => void;
  onOpenMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSearchChange,
  onNavigateTab,
  onOpenMobileMenu,
}) => {
  const { currentUser, role, switchRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    if (!currentUser?.id) return;
    const items = await getInAppNotifications(currentUser.id);
    setNotifications(items);
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    for (const n of notifications.filter(n => !n.is_read)) {
      await markNotificationAsRead(n.id);
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearchChange) onSearchChange(val);
  };

  // Role options for Founder testing/demo
  const roles: { role: UserRole; label: string; icon: React.ReactNode }[] = [
    { role: 'founder', label: 'Founder (Admin)', icon: <Crown className="w-3.5 h-3.5" /> },
    { role: 'social_media_manager', label: 'Social Media Manager', icon: <Megaphone className="w-3.5 h-3.5" /> },
    { role: 'editor', label: 'Video Editor', icon: <Film className="w-3.5 h-3.5" /> },
    { role: 'client', label: 'External Client', icon: <Briefcase className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-16 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Search Input */}
      <div className="flex-1 max-w-md relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search projects, video tasks, editors, clients..."
          className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Founder Role Switcher (For testing / demo) */}
        <div className="relative" ref={roleRef}>
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 hover:text-white transition"
            title="Role"
          >
            <span className="text-white font-bold">
              {role === 'founder'
                ? 'Founder'
                : role === 'social_media_manager'
                ? 'Social Media Manager'
                : role === 'editor'
                ? 'Video Editor'
                : 'Client Partner'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
              <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Switch Role Perspective
              </div>
              {roles.map((item) => (
                <button
                  key={item.role}
                  onClick={() => {
                    switchRole(item.role);
                    setShowRoleMenu(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition text-left ${
                    role === item.role
                      ? 'bg-white text-black font-black'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="relative p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-black font-black text-[9px] rounded-full flex items-center justify-center shadow-lg">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-white transition"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-500">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => !item.is_read && handleMarkAsRead(item.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        item.is_read
                          ? 'bg-zinc-950/40 border-zinc-800/40 text-zinc-400'
                          : 'bg-zinc-800/80 border-zinc-700 text-white font-semibold'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-white text-[11px]">
                          {item.title}
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
                        {item.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Mini Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-800/80">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-black text-white shrink-0">
            {currentUser?.full_name ? currentUser.full_name[0].toUpperCase() : 'U'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-bold text-white truncate max-w-[120px]">
              {currentUser?.full_name || 'Studio Member'}
            </div>
            <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">
              {currentUser?.email}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
