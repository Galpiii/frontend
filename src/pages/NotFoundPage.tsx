import { Link } from 'react-router'
import { Brand } from '../components/layout'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center break-keep">
      <Brand size="landing" />
      <div className="space-y-2">
        <h1 className="text-[22px] font-extrabold tracking-[-.4px]">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="text-[13.5px] leading-relaxed text-muted">
          주소가 바뀌었거나 삭제된 페이지일 수 있습니다.
        </p>
      </div>
      <Link to="/" className="text-[13.5px] font-bold">
        처음 화면으로 돌아가기
      </Link>
    </main>
  )
}
