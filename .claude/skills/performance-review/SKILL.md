---
name: performance-review
description: 코드베이스 성능 병목을 감사하는 스킬. N+1 쿼리 탐지, 알고리즘 복잡도 분석, 메모리 누수 탐지, 캐싱 전략 검토 요청 시 이 스킬을 참조한다. code-review-orchestrator가 performance-auditor를 호출할 때 참조한다.
---

## 고위험 성능 패턴 — 즉시 탐지

### N+1 쿼리 (🔴 Critical)
```javascript
// 위험 — 루프 안 DB 쿼리
const users = await User.findAll();
for (const user of users) {
  user.posts = await Post.findAll({ where: { userId: user.id } }); // N번 쿼리
}

// 안전 — JOIN 또는 include
const users = await User.findAll({ include: [Post] });
// 또는
const users = await prisma.user.findMany({ include: { posts: true } });
```

### 중첩 루프 O(n²) (🔴 Critical)
```javascript
// 위험
for (const a of listA) {          // n번
  for (const b of listB) {        // m번 → O(n×m)
    if (a.id === b.userId) { ... }
  }
}

// 안전 — Map으로 O(n+m)
const mapB = new Map(listB.map(b => [b.userId, b]));
for (const a of listA) {
  const b = mapB.get(a.id);
}
```

### 메모리 누수 패턴 (🔴 Critical)
```javascript
// 위험 — 이벤트 리스너 해제 안 함 (React)
useEffect(() => {
  window.addEventListener('resize', handler);
  // cleanup 없음!
}, []);

// 안전
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### 캐시 없는 반복 계산 (🟡 Major)
```javascript
// 위험 — 요청마다 동일한 무거운 계산
app.get('/stats', async (req, res) => {
  const result = await db.query('SELECT COUNT(*), AVG(...) FROM big_table'); // 매번 실행
  res.json(result);
});

// 안전 — Redis 캐싱
app.get('/stats', async (req, res) => {
  const cached = await redis.get('stats');
  if (cached) return res.json(JSON.parse(cached));
  const result = await db.query('...');
  await redis.setex('stats', 300, JSON.stringify(result)); // 5분 캐시
  res.json(result);
});
```

## 탐지 방법별 패턴

### N+1 쿼리 탐지 (Grep)
```bash
# 루프 내 ORM 호출 패턴
grep -n "await.*findOne\|await.*findById\|await.*query" src/ -r | grep -v "test/"
# 결과를 보고 루프(for, forEach, map) 내부인지 수동 확인
```

### 동기 블로킹 탐지
```bash
# fs.readFileSync, execSync 등 동기 호출
grep -rn "Sync(" src/
grep -rn "readFileSync\|writeFileSync\|execSync" src/
```

## 프론트엔드 성능 체크

```javascript
// React 불필요한 리렌더링
// 문제: 부모 렌더링마다 자식 재렌더링
const Child = ({ onClick }) => <button onClick={onClick}>Click</button>;

// 해결: memo + useCallback
const Child = React.memo(({ onClick }) => <button onClick={onClick}>Click</button>);
const handleClick = useCallback(() => { ... }, [dep]);

// 비용 큰 계산 캐싱
// 문제
const sorted = items.sort(compareFn); // 매 렌더링마다 정렬
// 해결
const sorted = useMemo(() => [...items].sort(compareFn), [items]);
```

## 데이터베이스 인덱스 가이드

```sql
-- WHERE 절에 자주 사용되는 컬럼
CREATE INDEX idx_users_email ON users(email);

-- ORDER BY + LIMIT 패턴
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- 복합 인덱스 (AND 조건)
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
```
