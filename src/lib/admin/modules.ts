export type AdminModuleStatus = 'implemented' | 'placeholder'

export type AdminModule = {
  id: string
  title: string
  description: string
  href: string
  status: AdminModuleStatus
  showInNav: boolean
  navOrder: number
  /** Primary database tables used by this module */
  tables: string[]
}

/** Canonical registry of admin console modules. Implement one module at a time. */
export const ADMIN_MODULES: AdminModule[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Founder dashboard — revenue, AI costs, profit, and platform health.',
    href: '/admin/dashboard',
    status: 'implemented',
    showInNav: true,
    navOrder: 10,
    tables: ['profiles', 'coaches', 'plans', 'checkins', 'ai_generation_logs'],
  },
  {
    id: 'clients',
    title: 'Clients',
    description: 'Client roster, search, filters, and coach assignment.',
    href: '/admin/clients',
    status: 'implemented',
    showInNav: true,
    navOrder: 20,
    tables: ['profiles', 'coaches'],
  },
  {
    id: 'coaches',
    title: 'Coaches',
    description: 'Coach roster and workload overview.',
    href: '/admin/coaches',
    status: 'implemented',
    showInNav: true,
    navOrder: 30,
    tables: ['coaches', 'profiles'],
  },
  {
    id: 'plans',
    title: 'Active Plans',
    description: 'Read-only view of delivered coaching plans.',
    href: '/admin/plans',
    status: 'implemented',
    showInNav: true,
    navOrder: 40,
    tables: ['plans'],
  },
  {
    id: 'support',
    title: 'Support Queue',
    description: 'Oversight of client coaching support requests.',
    href: '/admin/support',
    status: 'implemented',
    showInNav: true,
    navOrder: 50,
    tables: ['support_requests', 'support_messages'],
  },
  {
    id: 'onboarding',
    title: 'Pending Onboarding',
    description: 'Clients who have not completed onboarding.',
    href: '/admin/onboarding',
    status: 'implemented',
    showInNav: true,
    navOrder: 60,
    tables: ['profiles'],
  },
  {
    id: 'ai-logs',
    title: 'AI Logs',
    description: 'AI generation trace logs for debugging and QA.',
    href: '/admin/ai-logs',
    status: 'implemented',
    showInNav: true,
    navOrder: 70,
    tables: ['ai_generation_logs'],
  },
  {
    id: 'prompts',
    title: 'Prompt Library',
    description: 'Manage AI coaching prompts and version history.',
    href: '/admin/prompts',
    status: 'implemented',
    showInNav: true,
    navOrder: 80,
    tables: ['prompt_library', 'prompt_library_versions'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Platform notification templates and delivery logs.',
    href: '/admin/notifications',
    status: 'placeholder',
    showInNav: true,
    navOrder: 90,
    tables: ['platform_notifications'],
  },
  {
    id: 'purchases',
    title: 'Purchases',
    description: 'Payment and subscription purchase history.',
    href: '/admin/purchases',
    status: 'implemented',
    showInNav: true,
    navOrder: 100,
    tables: ['purchases'],
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'System configuration and feature flags.',
    href: '/admin/settings',
    status: 'implemented',
    showInNav: true,
    navOrder: 110,
    tables: [],
  },
  {
    id: 'testing-tools',
    title: 'Testing Tools',
    description: 'Create trial coach and client accounts for internal QA and demos.',
    href: '/admin/testing-tools',
    status: 'implemented',
    showInNav: true,
    navOrder: 115,
    tables: ['profiles', 'coaches'],
  },
]

export function getAdminNavModules(): AdminModule[] {
  return ADMIN_MODULES.filter((m) => m.showInNav).sort((a, b) => a.navOrder - b.navOrder)
}

export function getAdminModuleById(id: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.id === id)
}

export function getAdminModuleByHref(href: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.href === href || href.startsWith(`${m.href}/`))
}
