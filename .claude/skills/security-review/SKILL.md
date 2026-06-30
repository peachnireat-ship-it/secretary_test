---
name: security-review
description: 코드베이스 보안 취약점을 감사하는 스킬. OWASP Top 10 검증, SQL 인젝션·XSS·CSRF 탐지, 인증/인가 검증, 시크릿 노출 탐지 요청 시 이 스킬을 참조한다. code-review-orchestrator가 security-auditor를 호출할 때 참조한다.
---

## 고위험 코드 패턴 — 즉시 탐지

### SQL Injection (🔴 Critical)
```javascript
// 위험
db.query(`SELECT * FROM users WHERE id = ${userId}`);
db.query("SELECT * FROM users WHERE name = '" + name + "'");

// 안전
db.query('SELECT * FROM users WHERE id = ?', [userId]);
prisma.user.findUnique({ where: { id: userId } });
```

### 하드코딩 시크릿 (🔴 Critical)
```javascript
// 탐지 패턴 (Grep으로 검색)
const API_KEY = "sk-xxxxx";
JWT_SECRET = "mysecret123";
password: "admin1234";

// 탐지 정규식
/["'](?:api[_-]?key|secret|password|token|jwt)['"]\s*[:=]\s*["'][^"']{8,}/i
```

### XSS (🟡 Major)
```javascript
// 위험 (React)
<div dangerouslySetInnerHTML={{ __html: userInput }} />
element.innerHTML = userInput;

// 위험 (Node.js 템플릿)
res.send(`<div>${req.query.name}</div>`);
```

### IDOR (Insecure Direct Object Reference) (🟡 Major)
```javascript
// 위험 — 다른 사용자 데이터 접근 가능
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id); // ← userId 검증 없음
  res.json(order);
});

// 안전
const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
```

### JWT 취약점 (🟡 Major)
```javascript
// 위험 — algorithm: 'none' 허용
jwt.verify(token, secret); // algorithm 명시 없음

// 안전
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

## 탐지 방법별 Grep 패턴

```bash
# 시크릿 하드코딩
grep -rn "password\s*=\s*['\"]" src/
grep -rn "api_key\s*=\s*['\"]" src/
grep -rn "sk-" src/

# SQL Injection 의심
grep -rn "query.*\${" src/
grep -rn "query.*+.*req\." src/

# XSS 의심
grep -rn "dangerouslySetInnerHTML" src/
grep -rn "innerHTML\s*=" src/

# eval 사용
grep -rn "\beval\b(" src/
grep -rn "Function(" src/
```

## 인증 체크리스트

```
인증 미들웨어 적용 확인:
1. 보호 라우트 목록 작성 (요구사항 또는 주석에서)
2. 각 라우트에 auth 미들웨어 호출 여부 확인
3. 미들웨어가 우회 가능한 패턴인지 검토 (ex. OPTIONS 메서드 예외 처리)
```

## 의존성 취약점 확인

`package.json` 또는 `requirements.txt`에서 알려진 취약 버전 확인:
- `npm audit` 결과 해석 방법 제공
- CVE 참조 링크 포함
