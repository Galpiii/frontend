import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
export function Brand({ name = '서비스명' }: { name?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-extrabold">
      <span
        aria-hidden="true"
        className="flex size-[26px] items-center justify-center rounded-lg border border-primary-border bg-primary text-white"
      >
        ◆
      </span>
      {name}
    </span>
  )
}
export function AppHeader({
  brandName,
  context,
  actions,
}: {
  brandName?: string
  context?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-4 border-b border-line bg-surface px-5 py-3 md:px-7">
      <Brand name={brandName} />
      {context && <div className="text-[13px] text-muted">{context}</div>}
      <div className="ml-auto flex items-center gap-3">{actions}</div>
    </header>
  )
}
export interface SidebarItem {
  id: string
  label: string
  icon?: ReactNode
  href: string
}
export function Sidebar({
  items,
  activeId,
  footer,
  backLink,
}: {
  items: SidebarItem[]
  activeId: string
  footer?: ReactNode
  backLink?: ReactNode
}) {
  return (
    <aside className="flex shrink-0 flex-col border-b border-line bg-[#f8f9fd] py-3 md:w-[212px] md:border-r md:border-b-0">
      {backLink && <div className="px-5 pb-3 text-[13px]">{backLink}</div>}
      <nav
        aria-label="프로젝트 메뉴"
        className="flex overflow-x-auto md:flex-col"
      >
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            aria-current={activeId === item.id ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-l-[3px] px-5 py-2.5 text-[13.5px]',
              activeId === item.id
                ? 'border-primary bg-accent-bg font-extrabold text-primary'
                : 'border-transparent text-muted hover:bg-neutral-bg',
            )}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      {footer && (
        <div className="mt-auto hidden border-t border-line px-5 py-3 text-xs leading-loose text-muted md:block">
          {footer}
        </div>
      )}
    </aside>
  )
}
export function AppShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode
  sidebar?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-3">
        본문으로 바로가기
      </a>
      {header}
      <div className="flex flex-1 flex-col md:flex-row">
        {sidebar}
        <main
          id="main-content"
          className="min-w-0 flex-1 px-5 py-6 md:px-[30px]"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
