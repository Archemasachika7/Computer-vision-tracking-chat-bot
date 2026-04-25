'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../components/AuthProvider';

export default function ProfilePage() {
  const { user, profile, loading, refreshProfile, isAdmin } = useAuth();
  const router = useRouter();

  const [fullName,   setFullName]   = useState('');
  const [username,   setUsername]   = useState('');
  const [bio,        setBio]        = useState('');
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [message,    setMessage]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setUsername(profile.username ?? '');
      setBio(profile.bio ?? '');
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `avatars/${user.id}-${Date.now()}`;
    const { error } = await supabase.storage.from('chat-uploads').upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('chat-uploads').getPublicUrl(path);
      setAvatarUrl(publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      username,
      bio,
      avatar_url: avatarUrl,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: 'err', text: error.message });
    } else {
      await refreshProfile();
      setMessage({ type: 'ok', text: 'Profile saved!' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user)   return null;

  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user.email?.[0].toUpperCase() ?? '?';

  return (
    <main className="profile-shell">
      <div className="profile-card">
        <h1 className="profile-title">Your Profile</h1>
        {isAdmin && <span className="profile-admin-badge">⚙️ Administrator</span>}

        {/* Avatar */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrap" onClick={() => fileRef.current?.click()}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-initials">{initials}</span>
            )}
            <div className="profile-avatar-overlay">
              {uploading ? '⏳' : '📷 Change'}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
          <p className="profile-avatar-hint">Click to upload a photo</p>
        </div>

        {message && (
          <div className={`profile-message ${message.type === 'ok' ? 'msg-ok' : 'msg-err'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="profile-form">
          <label className="auth-label">
            Full Name
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              className="auth-input" placeholder="Jane Smith" />
          </label>
          <label className="auth-label">
            Username
            <input value={username} onChange={e => setUsername(e.target.value)}
              className="auth-input" placeholder="janesmth" />
          </label>
          <label className="auth-label">
            Email
            <input value={user.email ?? ''} className="auth-input" disabled />
          </label>
          <label className="auth-label">
            Bio
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              className="auth-input auth-textarea" placeholder="Tell us a bit about yourself…" rows={3} />
          </label>

          <div className="profile-meta">
            <span>Role: <strong>{profile?.role ?? 'user'}</strong></span>
            <span>Member since: <strong>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</strong></span>
          </div>

          <button type="submit" disabled={saving} className="auth-btn">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>
    </main>
  );
}
