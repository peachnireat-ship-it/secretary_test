import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { getProfileDepartments } from '../services/storage';

/**
 * 담당자 관리(ClientScreen.js) 화면에서 linked_profile_id로 연결된 상대방(실제 가입 회원과
 * 연결된 담당자)들의 소속 부서를 Supabase Realtime(웹소켓 push)으로 실시간 반영하는 훅.
 * 회사 관리자가 부서를 지정/변경하면(assign_employee_department RPC), 화면을 닫았다 열거나
 * 새로고침하지 않아도 이미 열려있는 화면에 즉시 반영된다.
 *
 * profile_department_public 테이블(profiles.department_id의 공개 조회용 미러, schema.sql 참고)의
 * UPDATE 이벤트를 구독한다. 여러 명을 동시에 구독해야 하므로 채널 필터로 특정 profile_id 하나만
 * 걸러내지 않고, 콜백 안에서 linkedProfileIds에 포함되는지 클라이언트에서 직접 판단한다.
 *
 * @param {string[]} linkedProfileIds 현재 화면에 보이는 클라이언트들의 linkedProfileId 목록(중복/빈값 무관)
 * @returns {{ departmentByProfileId: Object<string, string|null> }} profileId -> 부서명(없으면 null) 맵
 */
export function useLiveDepartments(linkedProfileIds) {
  const [departmentByProfileId, setDepartmentByProfileId] = useState({});
  // 배열 참조가 매 렌더마다 바뀌어도 내용이 같으면 재조회하지 않도록 문자열 키로 정규화
  const idsKey = [...new Set((linkedProfileIds || []).filter(Boolean))].sort().join(',');
  // realtime 콜백(마운트 시 1회만 구독)이 항상 최신 대상 목록을 참조할 수 있도록 ref로 보관
  const idsRef = useRef([]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    idsRef.current = ids;
    if (ids.length === 0) {
      // 대상이 없어졌을 때(예: 목록이 비워짐) 이전 부서 데이터가 잠깐이라도 남아있지 않도록 즉시 리셋
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepartmentByProfileId({});
      return;
    }
    let cancelled = false;
    getProfileDepartments(ids).then((map) => {
      if (!cancelled) setDepartmentByProfileId(map);
    });
    return () => { cancelled = true; };
  }, [idsKey]);

  useEffect(() => {
    const channel = supabase
      .channel('profile_department_public_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profile_department_public' },
        async (payload) => {
          const profileId = payload.new?.profile_id;
          if (!profileId || !idsRef.current.includes(profileId)) return;

          const departmentId = payload.new?.department_id;
          if (!departmentId) {
            setDepartmentByProfileId((prev) => ({ ...prev, [profileId]: null }));
            return;
          }
          // 캐시에 없는 새 department_id일 수 있으므로 매번 안전하게 단일 조회
          const { data, error } = await supabase.from('departments').select('name').eq('id', departmentId).single();
          setDepartmentByProfileId((prev) => ({ ...prev, [profileId]: error ? null : (data?.name || null) }));
        }
      )
      .subscribe();

    // cleanup 누락 시 메모리 누수/중복 구독이 발생하므로 언마운트 시 반드시 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { departmentByProfileId };
}
