import { Badge } from '../ui'

/** Static product explanation, not an interactive sample project. */
export function ResultPreview() {
  return (
    <aside
      aria-labelledby="result-preview-title"
      className="flex flex-col gap-[13px] rounded-[14px] border border-line bg-surface p-[18px] shadow-[0_14px_40px_rgba(30,25,5,0.07)]"
    >
      <p className="text-[11.5px] font-extrabold tracking-[.4px] text-faint">
        이렇게 연결됩니다
      </p>
      <div>
        <h2 id="result-preview-title" className="text-base font-extrabold">
          사용자 회원가입
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          세부 요구사항 3개 · 관련 PR 3개 · 저장소 2개
        </p>
      </div>
      <section className="overflow-hidden rounded-[11px] border border-line">
        <h3 className="break-all border-b border-line bg-subtle px-3 py-2 font-mono text-xs font-bold">
          gdg-platform-backend
        </h3>
        <div className="space-y-2 px-3 py-[11px]">
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="font-mono text-xs text-faint">#42</span>
            <h4 className="font-bold">feat: 회원가입 API 구현</h4>
          </div>
          <Badge tone="success">요구사항 3개 직접 일치</Badge>
          <p className="text-[12.5px] leading-[1.65] text-muted">
            PR 설명의 「이메일·비밀번호 검증과 사용자 생성」 작업에서 이 기능의
            요구사항과 관련된 내용이 발견되었습니다.
          </p>
          <ul className="space-y-1 text-[12.5px] leading-relaxed text-body">
            <li>
              <span aria-hidden="true" className="mr-1.5 text-success">
                ✓
              </span>
              이메일과 비밀번호를 입력할 수 있다.
            </li>
            <li>
              <span aria-hidden="true" className="mr-1.5 text-success">
                ✓
              </span>
              가입 성공 후 사용자 정보가 저장된다.
            </li>
          </ul>
        </div>
      </section>
      <section className="overflow-hidden rounded-[11px] border border-line">
        <h3 className="break-all border-b border-line bg-subtle px-3 py-2 font-mono text-xs font-bold">
          gdg-platform-frontend
        </h3>
        <ul className="space-y-2 px-3 py-[11px] text-[13px] font-bold">
          <li className="flex items-baseline gap-2">
            <span className="font-mono text-xs font-normal text-faint">
              #18
            </span>
            feat: 회원가입 화면 구현
          </li>
          <li className="flex items-baseline gap-2">
            <span className="font-mono text-xs font-normal text-faint">
              #21
            </span>
            feat: 이메일 중복 확인 UI
          </li>
        </ul>
      </section>
      <p className="text-xs leading-relaxed text-muted">
        서비스 이해를 돕기 위한 결과 예시입니다. 기능 구현 여부를 판정하지 않고,
        관련된 개발 작업 근거를 정리합니다.
      </p>
    </aside>
  )
}
