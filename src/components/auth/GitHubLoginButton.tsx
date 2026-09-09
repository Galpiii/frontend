import type { ButtonHTMLAttributes } from 'react'
import githubMark from '../../assets/github-invertocat-white.svg'
import { cn } from '../../lib/cn'

type GitHubLoginButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  loading?: boolean
}

/** Official GitHub Invertocat asset; Tailwind implementation of Primer button styling. */
export function GitHubLoginButton({
  loading = false,
  disabled,
  className,
  ...props
}: GitHubLoginButtonProps) {
  return (
    <button
      {...props}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-3 rounded-md border border-[#1f2328] bg-[#25292e] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#32383f] active:bg-[#1f2328] focus-visible:outline-[#0969da] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        <img
          src={githubMark}
          alt=""
          width={20}
          height={20}
          className="size-5 object-contain"
        />
      )}
      {loading ? 'GitHub로 이동 중…' : 'GitHub로 로그인'}
    </button>
  )
}
