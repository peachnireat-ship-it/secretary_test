import { useState, useRef } from 'react';
import { askClaude, buildProjectDelaySystem } from '../services/claude';
import { updateProject } from '../services/storage';

/**
 * 프로젝트 화면 AI 지연 분석 채팅 상태·로직 공통 훅.
 * AI 응답에 update_project 액션 JSON이 포함되면 즉시 프로젝트를 갱신한다.
 * @param {object} params
 * @param {Array} params.projects 현재 프로젝트 목록 (시스템 프롬프트 생성용)
 * @param {(projects: Array) => void} params.setProjects 프로젝트 목록 갱신 콜백 (update_project 액션 적용 시 호출)
 */
export function useProjectAI({ projects, setProjects }) {
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '안녕하세요! 프로젝트 지연 분석 AI입니다.\n\n"전체 지연 분석해줘", "가장 위험한 프로젝트가 뭐야?", "이번 주 조치 계획 세워줘" 와 같이 물어보세요.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  async function handleAIChat() {
    const text = chatInput.trim();
    if (!text || aiLoading) return;
    setChatInput('');

    const userMsg = { role: 'user', text };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setAiLoading(true);

    try {
      const apiMessages = history
        .filter((m, i) => !(m.role === 'assistant' && i === 0))
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));

      const systemPrompt = buildProjectDelaySystem(projects, []);
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });

      const jsonMatch = reply.match(/\{[\s\S]*?"action"\s*:\s*"update_project"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.action === 'update_project' && parsed.id && parsed.changes) {
            const updated = await updateProject(parsed.id, parsed.changes);
            setProjects(updated);
            const target = updated.find((p) => p.id === parsed.id);
            const changes = parsed.changes;
            const changeSummary = Object.entries(changes)
              .map(([k, v]) => `${k === 'status' ? '상태' : k === 'progress' ? '진행률' : k}: ${v}${k === 'progress' ? '%' : ''}`)
              .join(', ');
            const confirmText = `프로젝트를 업데이트했습니다.\n"${target?.title}" — ${changeSummary}`;
            setChatMessages([...history, { role: 'assistant', text: confirmText }]);
          }
        } catch {
          setChatMessages([...history, { role: 'assistant', text: reply }]);
        }
      } else {
        setChatMessages([...history, { role: 'assistant', text: reply }]);
      }
    } catch (e) {
      const errText = e.message === 'API_KEY_MISSING'
        ? 'API 키가 설정되지 않았습니다. 설정 탭에서 API 키를 입력해주세요.'
        : `오류: ${e.message}`;
      setChatMessages([...history, { role: 'assistant', text: errText }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function handleQuickAnalysis() {
    setShowAI(true);
    if (chatMessages.length > 1) return;
    setChatInput('');
    const userMsg = { role: 'user', text: '전체 프로젝트 지연 원인을 분석하고 우선 조치 계획을 알려줘.' };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setAiLoading(true);

    try {
      const apiMessages = [{ role: 'user', content: userMsg.text }];
      const systemPrompt = buildProjectDelaySystem(projects, []);
      const reply = await askClaude(apiMessages, systemPrompt);
      setChatMessages([...history, { role: 'assistant', text: reply }]);
    } catch (e) {
      const errText = e.message === 'API_KEY_MISSING'
        ? 'API 키가 설정되지 않았습니다. 설정 탭에서 API 키를 입력해주세요.'
        : `오류: ${e.message}`;
      setChatMessages([...history, { role: 'assistant', text: errText }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return {
    showAI, setShowAI,
    chatMessages, chatInput, setChatInput, aiLoading, chatScrollRef,
    handleAIChat, handleQuickAnalysis,
  };
}
