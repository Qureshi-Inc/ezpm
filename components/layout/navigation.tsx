'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Home, CreditCard, Clock, LogOut, Users, Building, DollarSign, Menu, X } from 'lucide-react'

interface NavigationProps {
  role: 'admin' | 'tenant'
  userName?: string
}

export function Navigation({ role, userName }: NavigationProps) {
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/auth/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const tenantLinks = [
    { href: '/tenant', label: 'Dashboard', icon: Home },
    { href: '/tenant/pay', label: 'Pay Rent', icon: DollarSign },
    { href: '/tenant/payment-methods', label: 'Payment Methods', icon: CreditCard },
    { href: '/tenant/payment-history', label: 'Payment History', icon: Clock },
  ]

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: Home },
    { href: '/admin/tenants', label: 'Tenants', icon: Users },
    { href: '/admin/properties', label: 'Properties', icon: Building },
    { href: '/admin/payments', label: 'Payments', icon: DollarSign },
  ]

  const links = role === 'admin' ? adminLinks : tenantLinks

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href={role === 'admin' ? '/admin' : '/tenant'}>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 hover:text-primary cursor-pointer transition-colors">
                  Rent Payment Portal
                </h1>
              </Link>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              {links.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary transition-colors"
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </div>
          
          <div className="flex items-center">
            {/* Desktop User Info & Logout */}
            <div className="hidden sm:flex sm:items-center">
              {userName && (
                <span className="text-sm text-gray-700 mr-4">
                  Welcome, {userName}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="flex items-center"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
            
            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
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
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t bg-gray-50">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className="text-gray-900 hover:text-primary hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium transition-colors"
              >
                <div className="flex items-center">
                  <Icon className="w-4 h-4 mr-3" />
                  {link.label}
                </div>
              </Link>
            )
          })}
          
          {/* Mobile User Info & Logout */}
          <div className="border-t pt-4 mt-4">
            {userName && (
              <div className="px-3 py-2 text-sm text-gray-700">
                Welcome, {userName}
              </div>
            )}
            <button
              onClick={() => {
                handleLogout()
                closeMobileMenu()
              }}
              className="text-gray-900 hover:text-red-600 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors"
            >
              <div className="flex items-center">
                <LogOut className="w-4 h-4 mr-3" />
                Logout
              </div>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
} 