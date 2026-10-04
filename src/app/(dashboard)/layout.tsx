import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SidebarNav from '@/components/layout/SidebarNav'
import MobileHeaderActions from '@/components/layout/MobileHeaderActions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userEmail = user.email || 'operator@rfqdeck.com'

  // Fetch company plan details
  const { data: company } = await supabase
    .from('companies')
    .select('plan, subscription_status, rfq_count_this_month')
    .eq('id', user.id)
    .single()

  // Calculate RFQ usage for current month (with fallback to direct count)
  let rfqCount = company?.rfq_count_this_month
  if (rfqCount === undefined || rfqCount === null) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('rfqs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', user.id)
      .gte('created_at', startOfMonth.toISOString())

    rfqCount = count ?? 0
  }

  const subscription = {
    plan: (company?.plan || 'free').toLowerCase() as 'free' | 'pro',
    status: company?.subscription_status || 'inactive',
    rfqCount: rfqCount ?? 0,
    rfqLimit: 3,
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-bg-base font-body text-text-primary antialiased">
      {/* Sidebar Navigation (Desktop left sidebar & Mobile bottom bar) */}
      <SidebarNav userEmail={userEmail} subscription={subscription} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Bar / Control Panel Header */}
        <header className="h-14 md:h-16 border-b border-border-default flex items-center px-4 md:px-8 justify-between bg-bg-base sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            {/* Mobile Brand Badge */}
            <div className="flex md:hidden items-center gap-2 mr-1">
              <div className="bg-accent text-white font-mono font-bold text-xs flex items-center justify-center h-7 w-7 rounded-sm border border-accent-hover">
                RD
              </div>
              <span className="font-heading text-base font-bold text-text-primary tracking-tight">
                RFQDeck
              </span>
            </div>

            <span className="hidden sm:inline text-xs uppercase font-heading font-semibold tracking-wider text-text-secondary">
              MANUFACTURING PORTAL
            </span>
            <div className="w-1.5 h-1.5 bg-status-success rounded-full animate-pulse shrink-0" title="System Online"></div>
          </div>

          <div className="flex items-center gap-3 md:gap-4 text-xs font-mono text-text-muted">
            <span className="hidden sm:inline">SECURE GATEWAY</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden md:inline">AUTO-SYNC</span>

            {/* Mobile Sign Out Trigger */}
            <MobileHeaderActions userEmail={userEmail} />
          </div>
        </header>

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-bg-base p-4 sm:p-6 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}