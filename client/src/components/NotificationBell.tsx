import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const TOKEN_KEY = 'herm_auth_token';
const authHeader = () => {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const countQuery = useQuery<number>({
    queryKey: ['notification-count'],
    queryFn: () =>
      axios.get<{ success: boolean; data: { count: number } }>('/api/notifications/count', {
        headers: authHeader(),
      }).then(r => r.data.data.count),
    refetchInterval: 60_000,
    initialData: 0,
  });

  const notificationsQuery = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      axios.get<{ success: boolean; data: Notification[] }>('/api/notifications', {
        headers: authHeader(),
      }).then(r => r.data.data),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      axios.patch(`/api/notifications/${id}/read`, {}, { headers: authHeader() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/notifications/read-all', {}, { headers: authHeader() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const count = countQuery.data ?? 0;
  const notifications = notificationsQuery.data ?? [];

  const handleClick = (n: Notification) => {
    markReadMutation.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 text-white/60 hover:text-white transition-colors"
        aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-50" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {count > 0 && (
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notificationsQuery.isPending ? (
              <p className="text-center py-4 text-sm text-white/50">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="text-center py-4 text-sm text-white/50">No notifications.</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${!n.isRead ? 'bg-teal-900/10' : ''}`}
                >
                  <p className={`text-sm ${!n.isRead ? 'font-medium text-white' : 'text-white/70'}`}>{n.title}</p>
                  <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-white/30 mt-1">{new Date(n.createdAt).toLocaleDateString('en-GB')}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
