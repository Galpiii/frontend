import { useState } from 'react'
import { AppHeader, AppShell, Sidebar } from '../components/layout'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  FilterChip,
  IconButton,
  Input,
  Modal,
  Progress,
  SectionHeader,
  Select,
  StatCard,
  Stepper,
  Tabs,
  Textarea,
  Toast,
  type Tone,
} from '../components/ui'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const statuses: { tone: Tone; label: string }[] = [
  { tone: 'neutral', label: '분석 전' },
  { tone: 'info', label: '분석 중' },
  { tone: 'success', label: '분석 완료' },
  { tone: 'warning', label: '확인 필요' },
  { tone: 'danger', label: '분석 실패' },
  { tone: 'accent', label: '사용자 수정됨' },
]
const repositories = [
  {
    name: 'gdg-platform-backend',
    language: 'Java',
    prs: 42,
    tone: 'success' as const,
    status: '분석 완료',
  },
  {
    name: 'gdg-platform-frontend',
    language: 'TypeScript',
    prs: 28,
    tone: 'warning' as const,
    status: '일부 실패',
  },
]
export function ComponentPreview() {
  useDocumentTitle('컴포넌트 미리보기')
  const [tab, setTab] = useState('components')
  const [filter, setFilter] = useState('전체 저장소')
  const [overlay, setOverlay] = useState<'modal' | 'drawer' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [name, setName] = useState('GDG Platform')
  const [error, setError] = useState('')
  const [savedName, setSavedName] = useState('GDG Platform')
  const [progress, setProgress] = useState(64)
  const save = () => {
    if (!name.trim()) {
      setError('프로젝트 이름을 입력해주세요.')
      return
    }
    setSavedName(name.trim())
    setError('')
    setOverlay(null)
    setToast('프로젝트 이름을 미리보기에 반영했습니다.')
  }
  const components = (
    <div className="space-y-6">
      <section id="buttons" className="scroll-mt-6 space-y-3">
        <h3 className="text-[15.5px] font-extrabold">버튼과 상태</h3>
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setOverlay('modal')}>
              ＋ 새 프로젝트 만들기
            </Button>
            <Button variant="secondary" onClick={() => setOverlay('drawer')}>
              상세 보기 →
            </Button>
            <Button
              variant="dark"
              onClick={() => setToast('강조 버튼을 눌렀습니다.')}
            >
              강조 버튼
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setToast('삭제 버튼의 알림 예시입니다.')}
            >
              삭제
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToast('취소했습니다.')}
            >
              취소
            </Button>
            <IconButton
              label="추가 작업"
              onClick={() => setToast('추가 작업 버튼을 눌렀습니다.')}
            >
              ⋯
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setToast('작은 버튼을 눌렀습니다.')}
            >
              작은 버튼
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setToast('큰 버튼을 눌렀습니다.')}
            >
              큰 버튼
            </Button>
            <Button loading>분석 중…</Button>
            <Button disabled>분석 시작</Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {statuses.map((status) => (
              <Badge key={status.tone} tone={status.tone}>
                {status.label}
              </Badge>
            ))}
          </div>
        </Card>
      </section>
      <section id="forms" className="scroll-mt-6 space-y-3">
        <h3 className="text-[15.5px] font-extrabold">입력 폼</h3>
        <Card>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Input
              label="프로젝트 이름"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              error={error}
              placeholder="프로젝트 이름을 입력하세요"
              required
            />
            <Select label="Base Branch" defaultValue="main">
              <option value="main">main</option>
              <option value="develop">develop</option>
            </Select>
            <div className="sm:col-span-2">
              <Input
                label="GitHub Repository URL"
                placeholder="https://github.com/owner/repository"
                hint="GitHub 저장소의 URL을 입력하세요."
                type="url"
              />
            </div>
            <Textarea
              label="프로젝트 설명"
              placeholder="프로젝트를 간단히 설명해주세요."
            />
            <Input
              label="오류 상태 예시"
              defaultValue="github/"
              error="올바른 GitHub Repository URL을 입력해주세요."
            />
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <Checkbox label="Merged PR 포함" defaultChecked />
              <Checkbox label="Open PR 포함" />
              <Checkbox label="선택 불가" disabled />
              <Button type="submit" size="sm" className="ml-auto">
                이름 적용
              </Button>
            </div>
          </form>
        </Card>
      </section>
      <section id="data" className="scroll-mt-6 space-y-3">
        <h3 className="text-[15.5px] font-extrabold">필터와 데이터 테이블</h3>
        <div aria-label="저장소 필터" className="flex flex-wrap gap-2">
          {['전체 저장소', ...repositories.map((repo) => repo.name)].map(
            (item) => (
              <FilterChip
                key={item}
                selected={filter === item}
                onClick={() => setFilter(item)}
              >
                {item}
              </FilterChip>
            ),
          )}
        </div>
        <DataTable
          caption="저장소별 분석 현황 예시"
          rows={repositories.filter(
            (repo) => filter === '전체 저장소' || repo.name === filter,
          )}
          rowKey={(repo) => repo.name}
          columns={[
            {
              key: 'name',
              header: '저장소',
              render: (repo) => (
                <span className="font-mono font-semibold">{repo.name}</span>
              ),
            },
            {
              key: 'language',
              header: '언어',
              render: (repo) => repo.language,
            },
            { key: 'prs', header: '수집 PR', render: (repo) => repo.prs },
            {
              key: 'status',
              header: '상태',
              render: (repo) => <Badge tone={repo.tone}>{repo.status}</Badge>,
            },
            {
              key: 'action',
              header: '상세',
              render: (repo) => (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`${repo.name} 상세 보기`}
                  onClick={() => setOverlay('drawer')}
                >
                  보기 →
                </Button>
              ),
            },
          ]}
        />
      </section>
      <section id="feedback" className="scroll-mt-6 space-y-3">
        <h3 className="text-[15.5px] font-extrabold">안내와 진행 상태</h3>
        <Alert
          tone="warning"
          title="수정된 기능의 대조 결과가 오래된 상태입니다."
          action={
            <Button
              size="sm"
              onClick={() => {
                setProgress(100)
                setToast('미리보기 진행률을 100%로 변경했습니다.')
              }}
            >
              다시 대조
            </Button>
          }
        >
          수정된 기능만 다시 대조할 수 있습니다.
        </Alert>
        <Alert tone="danger">
          일부 PR을 분석하지 못했습니다. 실패한 항목만 다시 시도할 수 있습니다.
        </Alert>
        <Card className="space-y-6">
          <Stepper
            steps={['기능명세서 등록', '저장소 연결', '기능대조']}
            current={1}
          />
          <Progress label="PR 수집·요약" value={progress} />
        </Card>
        <EmptyState
          title="아직 대조할 기능 항목이 없습니다."
          description="기능명세서에서 추출한 기능 항목을 연결된 모든 저장소의 PR과 대조합니다."
          action={
            <Button onClick={() => setOverlay('modal')}>
              명세서 등록하기 →
            </Button>
          }
        />
      </section>
    </div>
  )
  return (
    <AppShell
      header={
        <AppHeader
          context={
            <span className="rounded-lg bg-neutral-bg px-3 py-1.5 font-bold">
              공통 컴포넌트
            </span>
          }
          actions={<Badge tone="accent">UI 미리보기</Badge>}
        />
      }
      sidebar={
        <Sidebar
          activeId="overview"
          items={[
            {
              id: 'overview',
              label: '컴포넌트 모음',
              href: '#main-content',
              icon: '◈',
            },
            {
              id: 'buttons',
              label: '버튼과 상태',
              href: '#buttons',
              icon: '▦',
            },
            { id: 'forms', label: '입력 폼', href: '#forms', icon: '▤' },
            { id: 'data', label: '필터와 테이블', href: '#data', icon: '☷' },
            {
              id: 'feedback',
              label: '안내와 진행 상태',
              href: '#feedback',
              icon: '◎',
            },
          ]}
          footer={
            <>
              <p className="font-bold">PR Analyzer</p>
              <p>v20 HTML 기반 공통 UI</p>
            </>
          }
        />
      }
    >
      <div className="max-w-[1020px] space-y-5">
        <SectionHeader
          title={savedName}
          description="PR Analyzer 공통 컴포넌트 · 원본 HTML의 색상과 UI 패턴을 확인하세요."
          action={
            <Button variant="secondary" onClick={() => setOverlay('modal')}>
              프로젝트 정보 수정
            </Button>
          }
        />
        <Alert tone="accent">
          이 화면은 컴포넌트 미리보기입니다. 데이터와 동작은 예시이며 서버에
          저장되지 않습니다.
        </Alert>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="연결된 저장소" value="2" />
          <StatCard label="수집한 PR" value="70" />
          <StatCard
            label="관련 PR이 발견된 기능"
            value="12"
            hint="기능 구현률이 아닙니다"
          />
        </div>
        <Tabs
          label="미리보기 유형"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              value: 'components',
              label: '공통 컴포넌트',
              content: components,
            },
            {
              value: 'example',
              label: '조합 예시',
              content: (
                <Card className="space-y-4">
                  <SectionHeader
                    title="사용자 회원가입"
                    description="세부 요구사항 3개 · 관련 PR 5개 · 저장소 2개"
                  />
                  <div className="rounded-[11px] border border-line">
                    <div className="border-b border-line bg-subtle px-3 py-2 font-mono text-xs font-bold">
                      gdg-platform-backend
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-faint">#42</span>
                        <strong>feat: 회원가입 API 구현</strong>
                        <Badge tone="success">요구사항 3개 직접 일치</Badge>
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted">
                        PR 설명의 「이메일·비밀번호 검증과 사용자 생성」
                        작업에서 이 기능의 요구사항과 관련된 내용이
                        발견되었습니다.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOverlay('drawer')}
                      >
                        근거 상세 보기 →
                      </Button>
                    </div>
                  </div>
                </Card>
              ),
            },
          ]}
        />
      </div>
      <Modal
        open={overlay === 'modal'}
        onClose={() => setOverlay(null)}
        title="프로젝트 정보 수정"
        description="공통 모달과 입력 폼 조합 예시입니다."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverlay(null)}>
              취소
            </Button>
            <Button onClick={save}>저장</Button>
          </>
        }
      >
        <Input
          label="프로젝트 이름"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          error={error}
          required
        />
      </Modal>
      <Drawer
        open={overlay === 'drawer'}
        onClose={() => setOverlay(null)}
        title="PR 작업 근거"
        description="우측 상세 패널 예시"
        footer={
          <Button variant="secondary" onClick={() => setOverlay(null)}>
            닫기
          </Button>
        }
      >
        <div className="space-y-4">
          <Badge tone="success">직접 일치</Badge>
          <h3 className="text-base font-bold">feat: 회원가입 API 구현</h3>
          <p className="leading-relaxed text-muted">
            이메일·비밀번호 검증과 사용자 생성 작업이 요구사항과 연결됩니다.
          </p>
          <Card>
            <ul className="list-inside list-disc space-y-2">
              <li>이메일과 비밀번호를 입력할 수 있다.</li>
              <li>가입 성공 후 사용자 정보가 저장된다.</li>
            </ul>
          </Card>
        </div>
      </Drawer>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </AppShell>
  )
}
