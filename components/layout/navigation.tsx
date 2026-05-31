'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, CreditCard, Clock, LogOut, Users, Building, DollarSign, Menu, X, Wrench, FileText, Megaphone } from 'lucide-react'

interface NavigationProps {
  role: 'admin' | 'tenant'
  userName?: string
}

export function Navigation({ role, userName }: NavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Federated logout: navigate to our /auth/signout route which clears the
  // Auth.js cookie AND redirects through Zitadel's end_session endpoint so
  // the Zitadel session dies too. Without that round-trip, signOut() just
  // bounces the user through /auth/start which silent-SSO's them right back
  // in via the still-alive Zitadel session — making the Logout button look
  // like a no-op.
  const handleLogout = () => {
    window.location.href = '/auth/signout'
  }

  const tenantLinks = [
    { href: '/tenant', label: 'Dashboard', icon: Home },
    { href: '/tenant/pay', label: 'Pay Rent', icon: DollarSign },
    { href: '/tenant/payment-methods', label: 'Payment Methods', icon: CreditCard },
    { href: '/tenant/maintenance', label: 'Maintenance', icon: Wrench },
    { href: '/tenant/documents', label: 'Documents', icon: FileText },
    { href: '/tenant/payment-history', label: 'Payment History', icon: Clock },
  ]

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: Home },
    { href: '/admin/tenants', label: 'Tenants', icon: Users },
    { href: '/admin/properties', label: 'Properties', icon: Building },
    { href: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
    { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/admin/payments', label: 'Payments', icon: DollarSign },
  ]

  const links = role === 'admin' ? adminLinks : tenantLinks

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href={role === 'admin' ? '/admin' : '/tenant'} className="flex items-center gap-2.5 group">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground shadow-soft transition-transform group-hover:-translate-y-0.5">
                  ez
                </span>
                <span className="font-display text-xl font-medium tracking-tight text-foreground">
                  EZPM
                  {role === 'admin' && (
                    <span className="ml-1.5 align-middle text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                      Admin
                    </span>
                  )}
                </span>
              </Link>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden md:ml-8 md:flex md:items-center md:gap-1">
              {links.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex items-center">
            {/* Desktop User Info & Logout */}
            <div className="hidden sm:flex sm:items-center sm:gap-3">
              {userName && (
                <span className="text-sm text-muted-foreground">
                  {userName}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? (
                  <X className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`md:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="px-3 pt-2 pb-3 space-y-1 border-t border-border/70 bg-card">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            )
          })}

          {/* Mobile User Info & Logout */}
          <div className="border-t border-border/70 pt-3 mt-3">
            {userName && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Signed in as {userName}
              </div>
            )}
            <button
              onClick={() => {
                handleLogout()
                closeMobileMenu()
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
} 