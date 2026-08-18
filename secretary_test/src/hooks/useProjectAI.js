import { useState, useRef } from 'react';
import { askClaude, buildProjectDelaySystem, fixForeignWordsInText, stripForeignScripts } from '../services/claude';
import { updateProject } from '../services/storage';

/**
 * 프로젝트 화면 AI 지연 분석 채팅 상태·로직 공통 훅.
 * AI 응답에 update_project 액션 JSON이 포함되면 즉시 프로젝트를 갱신한다.
 * @param {object} params
 * @param {Array} params.projects 현재 프로젝트 목록 (시스템 프롬프트 생성용) — "회사 전체" 컨텍스트에서는
 *   본인 소유가 아닌 프로젝트(다른 부서/직원 등록분)가 섞여 있을 수 있다.
 * @param {(projects: Array) => void} params.setProjects 프로젝트 목록 갱신 콜백 (update_project 액션 적용 시 호출)
 * @param {boolean} [params.readOnly=false] true면 "회사 전체" 등 본인 소유가 아닌 프로젝트가 섞여 있는
 *   컨텍스트로 간주해 update_project 액션 처리를 코드 레벨에서 완전히 건너뛰고 항상 텍스트 응답만 표시한다.
 */
const INITIAL_CHAT_MESSAGE = { role: 'assistant', text: '안녕하세요! 프로젝트 도우미 AI입니다.\n\n"등록자가 누구야?", "관련인물이 누구야?", "마감일이 언제야?" 와 같이 물어보세요.' };

export function useProjectAI({ projects, setProjects, readOnly = false }) {
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([INITIAL_CHAT_MESSAGE]);
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

      const systemPrompt = buildProjectDelaySystem(projects, [], { readOnly });
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });

      // readOnly 컨텍스트(회사 전체 등 본인 소유가 아닌 프로젝트가 섞여 있을 수 있음)에서는
      // AI가 실수로 update_project JSON을 출력하더라도 실제 업데이트가 실행되지 않도록
      // 시스템 프롬프트 지시와 별개로 코드 레벨에서 액션 감지 자체를 건너뛴다.
      const jsonMatch = readOnly ? null : reply.match(/\{[\s\S]*?"action"\s*:\s*"update_project"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.action === 'update_project' && parsed.id && parsed.changes) {
            // "내 프로젝트" 컨텍스트라도 관련인물로 등록되어 생긴 타 계정 프로젝트 사본(originProjectId 있음)은
            // DB 필터(user_id)만으로는 걸러지지 않아 실제 UPDATE가 먹으므로, 여기서 코드 레벨로 한 번 더 차단한다.
            const targetProject = projects.find((p) => p.id === parsed.id);
            if (targetProject?.originProjectId) {
              setChatMessages([...history, { role: 'assistant', text: '다른 사람이 등록한 프로젝트는 수정할 수 없습니다.' }]);
              return;
            }
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
          // JSON 파싱 실패 시 순수 텍스트 응답으로 간주해 외국어 교정을 거쳐 표시
          let fixedReply = reply;
          try {
            fixedReply = await fixForeignWordsInText(reply);
          } catch {
            // 외국어 교정 실패는 응답 표시 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
            fixedReply = stripForeignScripts(fixedReply);
          }
          setChatMessages([...history, { role: 'assistant', text: fixedReply }]);
        }
      } else {
        // update_project 액션 JSON이 없는 순수 텍스트 응답 — 안전하게 외국어 교정 적용
        let fixedReply = reply;
        try {
          fixedReply = await fixForeignWordsInText(reply);
        } catch {
          // 외국어 교정 실패는 응답 표시 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
          fixedReply = stripForeignScripts(fixedReply);
        }
        setChatMessages([...history, { role: 'assistant', text: fixedReply }]);
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
    const userMsg = { role: 'user', text: '전체 프로젝트 현황을 요약해줘.' };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setAiLoading(true);

    try {
      const apiMessages = [{ role: 'user', content: userMsg.text }];
      const systemPrompt = buildProjectDelaySystem(projects, [], { readOnly });
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });
      let fixedReply = reply;
      try {
        fixedReply = await fixForeignWordsInText(reply);
      } catch {
        // 외국어 교정 실패는 분석 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
        fixedReply = stripForeignScripts(fixedReply);
      }
      setChatMessages([...history, { role: 'assistant', text: fixedReply }]);
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

  // viewMode 전환('내 프로젝트' <-> '회사 전체') 등 컨텍스트가 바뀔 때 이전 대화 내역과
  // 새 컨텍스트 답변이 뒤섞이지 않도록 대화를 초기 인사말로 되돌린다.
  function resetChat() {
    setChatMessages([INITIAL_CHAT_MESSAGE]);
  }

  return {
    showAI, setShowAI,
    chatMessages, chatInput, setChatInput, aiLoading, chatScrollRef,
    handleAIChat, handleQuickAnalysis, resetChat,
  };
}
