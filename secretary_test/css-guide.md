## 🎨 CSS/StyleSheet 정리 규칙
1. 모든 인라인 스타일(Inline Style)은 지우고 `StyleSheet.create`로 이관한다.
2. 사용하지 않는(Unused) 스타일 클래스는 모두 찾아내어 제거한다.
3. 중복되는 공통 스타일(예: Flex center, Page Container 등)은 추출할 수 있도록 메모한다.
4. 컴포넌트 코드 하단에 스타일 정의를 깔끔하게 몰아둔다.