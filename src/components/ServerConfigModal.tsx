import React, { useState } from 'react';
import { getStoredSupabaseConfig, reconfigureSupabase } from '../lib/supabase';
import { Server, Check, X, ShieldAlert } from 'lucide-react';

interface ServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({ isOpen, onClose }) => {
  const current = getStoredSupabaseConfig();
  const [url, setUrl] = useState(current.url);
  const [key, setKey] = useState(current.key);
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    reconfigureSupabase(url, key);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
      window.location.reload();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700/60 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white">Supabase Connection</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Supabase Project URL
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Anon Public API Key
            </label>
            <textarea
              required
              rows={3}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-zinc-800 bg-black text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-xs">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-zinc-400" />
            <span>Settings are stored in your device's local browser storage.</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 rounded-full"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-black text-black bg-white hover:bg-zinc-200 active:scale-95 rounded-full shadow-md transition-all"
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4 text-black" />
                  <span>Saved!</span>
                </>
              ) : (
                'Save & Reconnect'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
