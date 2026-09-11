# PR Analyzer 공통 컴포넌트

`PR-Analyzer v20.dc.html`에서 반복되는 UI를 React + TypeScript + Tailwind CSS로 구성했습니다. 원본의 실행 스크립트나 모의 API 동작은 이식하지 않았습니다.

## 구조

- `ui/`: Button, IconButton, Badge, Card, SectionHeader, StatCard, Input, Textarea, Select, Checkbox, FilterChip, Tabs, Stepper, Alert, EmptyState, Progress, Toast, Modal, Drawer, DataTable
- `layout/`: Brand, AppHeader, Sidebar, AppShell
- `../index.css`: 원본 색상, 글꼴, 그림자와 Tailwind 테마 토큰
- `../pages/ComponentPreview.tsx`: 실행 가능한 사용 예시. 개발 모드에서 `/preview` 경로로 확인하며 프로덕션 번들에는 포함되지 않습니다.

## 사용

```tsx
import { useState } from 'react'
import { Badge, Button, Input, Modal } from './components/ui'

export function ProjectForm() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Badge tone="success">분석 완료</Badge>
      <Button onClick={() => setOpen(true)}>프로젝트 만들기</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="새 프로젝트">
        <Input label="프로젝트 이름" required />
      </Modal>
    </>
  )
}
```

- 버튼: `variant="primary | secondary | dark | ghost | danger"`, `size="sm | md | lg"`, `loading`, `icon`. 기본 type은 button이며 폼 제출은 `type="submit"`을 지정합니다.
- Badge/Alert/Toast: `tone="neutral | info | success | warning | danger | accent"`. 색상과 표시 문구를 분리하므로 도메인 상태 매핑은 각 기능에서 정의합니다.
- 폼: `label` 필수, `hint`/`error` 지원, 기본 HTML 입력 속성 지원. id와 설명 연결은 자동 생성합니다.
- Tabs: `items: { value, label, content, disabled? }[]`, `value`, `onValueChange`, 접근성 이름 `label`. 방향키/Home/End로 이동합니다.
- FilterChip: `selected`, `onClick`으로 단일/다중 선택을 호출부에서 관리합니다.
- Modal/Drawer: `open`, `onClose`, `title`, `description?`, `footer?`, children. native dialog로 포커스 제한, Escape/배경 클릭 닫기, 닫은 후 포커스 복원을 제공합니다. 한 번에 하나의 오버레이를 표시하는 구성을 권장합니다.
- Toast: `message: string | null`, `onDismiss`. 자동 닫힘이 필요하면 호출부에서 타이머를 관리합니다.
- DataTable: 제네릭 row 타입, `columns: { key, header, render }[]`, `rows`, `rowKey`, `caption`. 정렬/페이지 처리/데이터 조회는 호출부 책임입니다.
- Stepper의 `current`는 0부터 시작합니다. Progress의 `value`는 0–100입니다.
- SectionHeader와 EmptyState의 `level`은 제목 태그만 바꾸고 크기는 유지합니다. 페이지마다 h1부터 건너뛰지 않게 지정하세요.
- Sidebar는 실제 `href`를 받습니다. `#`으로 시작하면 브라우저 스크롤을 위해 네이티브 앵커로, 그 외에는 react-router `Link`로 렌더합니다. `activeId`는 호출부에서 현재 경로와 연결합니다.
- 공통 UI에는 API 호출이나 프로젝트 데이터를 포함하지 않습니다. 예시 데이터는 미리보기 페이지에만 있습니다.
- `className`은 배치 등 추가 스타일 용도입니다. 클래스 결합 유틸리티는 Tailwind 충돌 해결 기능이 없으므로 기본 스타일과 충돌하는 클래스 대신 제공된 variant를 사용하세요.

## 확인

`npm run dev` 후 `/preview`에서 미리보기를 확인합니다. `npm run build`는 TypeScript 및 프로덕션 번들을 검증하며 `npm run lint`는 정적 검사를 실행합니다. 폰트는 원본과 같은 Pretendard CDN을 사용하며 네트워크가 없으면 시스템 글꼴로 표시합니다.
