---
name: ux-design
description: 웹사이트 UI/UX 디자인 명세를 작성하는 스킬. 디자인 시스템, 컴포넌트 명세, 색상/타이포그래피 토큰, 레이아웃 설계 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 ux-designer를 호출할 때 참조한다.
---

## 목적

개발자가 디자인 툴 없이도 일관된 UI를 구현할 수 있는 텍스트 기반 디자인 명세를 작성한다.

## 디자인 토큰 시스템

Tailwind config로 바로 변환 가능한 형식으로 정의한다:

```typescript
// tailwind.config.ts 변환 대상
const tokens = {
  colors: {
    primary: { DEFAULT: '#3B82F6', hover: '#2563EB', light: '#EFF6FF' },
    secondary: { DEFAULT: '#6B7280', ... },
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
  },
  typography: {
    fontFamily: { sans: ['Inter', 'sans-serif'] },
    fontSize: { sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
  },
  spacing: { /* 4px 단위: 1=4px, 2=8px, 4=16px, 6=24px, 8=32px */ },
}
```

## 컴포넌트 명세 형식

```markdown
## {ComponentName}

**Props:**
| prop | type | default | 설명 |
|------|------|---------|-----|
| variant | 'primary' \| 'secondary' \| 'ghost' | 'primary' | 스타일 변형 |

**States:** default / hover / focus / disabled / loading

**Tailwind 클래스 예시:**
- primary: `bg-primary text-white hover:bg-primary-hover px-4 py-2 rounded-md`
- disabled: `opacity-50 cursor-not-allowed pointer-events-none`

**접근성:**
- role: button
- aria-disabled: disabled prop 연동
- 최소 터치 영역: 44px × 44px
```

## 색상 대비율 기준 (WCAG AA)

- 일반 텍스트: 4.5:1 이상
- 대형 텍스트(18px+): 3:1 이상
- UI 컴포넌트 경계: 3:1 이상

## 반응형 브레이크포인트

```
mobile:  < 640px   (Tailwind: default)
sm:     640~767px
md:     768~1023px
lg:    1024~1279px  (Tailwind: lg:)
xl:   1280px+       (Tailwind: xl:)
```

레이아웃 패턴:
- 그리드: mobile 1열 → md 2열 → lg 3열
- 내비게이션: mobile 햄버거 메뉴 → md+ 수평 메뉴
- 사이드바: mobile 숨김 → lg+ 표시
