// ClientScreen.parseTranscriptSegments, ProjectScreen.parseTranscriptSegments 통합 (완전 동일 로직)
export function parseTranscriptSegments(text) {
  if (!text) return [];
  const regex = /\[([^\]\n]+)\]([\s\S]*?)(?=\n*\[|$)/g;
  const segments = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    segments.push({ speaker: m[1], text: m[2].trim() });
  }
  return segments;
}
