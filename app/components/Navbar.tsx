'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';

export default function Navbar() {
  const { user, profile, isAdmin, signOut, loading } = useAuth();
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen] = useState(false);
  const dropRef   = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`nav-link ${pathname === href ? 'nav-link-active' : ''}`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link href="/" className="navbar-brand">
          🎯 <span>ProctorAI</span>
        </Link>

        {/* Nav links */}
        <div className="navbar-links">
          {navLink('/', 'Proctor')}
          {user && navLink('/quiz', 'Quizzes')}
          {isAdmin && navLink('/admin', 'Admin')}
        </div>

        {/* Right side */}
        <div className="navbar-right">
          {loading ? null : !user ? (
            <>
              <Link href="/auth/login"    className="nav-btn nav-btn-ghost">Sign In</Link>
              <Link href="/auth/register" className="nav-btn nav-btn-solid">Sign Up</Link>
            </>
          ) : (
            <div className="nav-avatar-wrap" ref={dropRef}>
              <button className="nav-avatar-btn" onClick={() => setOpen(o => !o)}>
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="avatar" className="nav-avatar-img" />
                ) : (
                  <span className="nav-avatar-initials">{initials}</span>
                )}
                <span className="nav-avatar-name">{profile?.full_name ?? user.email}</span>
                <span className="nav-avatar-caret">{open ? '▲' : '▼'}</span>
              </button>

              {open && (
                <div className="nav-dropdown">
                  <div className="nav-dropdown-header">
                    <div className="nav-dropdown-name">{profile?.full_name ?? 'User'}</div>
                    <div className="nav-dropdown-email">{user.email}</div>
                    {isAdmin && <span className="nav-admin-badge">Admin</span>}
                  </div>
                  <Link href="/profile" className="nav-dropdown-item" onClick={() => setOpen(false)}>
                    👤 Profile
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className="nav-dropdown-item" onClick={() => setOpen(false)}>
                      ⚙️ Admin Dashboard
                    </Link>
                  )}
                  <button className="nav-dropdown-item nav-dropdown-signout" onClick={handleSignOut}>
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
