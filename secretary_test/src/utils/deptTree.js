// 부서 트리 구조 유틸. flat departments({ id, name, parentId }[]) 배열을 계층 트리로 조립하고
// 들여쓰기 렌더링에 필요한 평면 배열로 다시 변환한다. CompanyScreen(부서 관리 사이드바)과
// LoginScreen(회원가입 부서 선택 모달)에서 공용으로 사용.

// 사이드바/피커에서 한 단계 들여쓰기당 사용하는 marginLeft(px).
export const DEPT_INDENT = 10;

// flat departments(id, name, parentId) 배열을 부모→자식 트리로 조립. 이미 방문한 id는 스킵해 순환 참조를 방어한다.
export function buildDeptTree(departments, parentId = null, visited = new Set()) {
  return departments
    .filter((d) => (d.parentId || null) === parentId && !visited.has(d.id))
    .map((d) => ({ ...d, children: buildDeptTree(departments, d.id, new Set(visited).add(d.id)) }));
}

// 트리를 depth(들여쓰기 단계) 포함 평면 배열로 변환(부모 다음에 자식이 오는 순서 유지). 목록 렌더링·들여쓰기 계산에 사용.
// isLast는 사이드바에 ├─/└─ 가지 기호를 그릴 때 자기 형제 목록에서 마지막인지 표시하는 값.
export function flattenDeptTree(nodes, depth = 0) {
  const out = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const { children, ...rest } = node;
    out.push({ ...rest, depth, isLast });
    out.push(...flattenDeptTree(children, depth + 1));
  });
  return out;
}
