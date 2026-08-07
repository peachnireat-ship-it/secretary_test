import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Animated, Switch,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { IS_PC } from '../utils/deviceType';
import { useSwipeClose } from '../hooks/useSwipeClose';
import {
  getCompanyEmployees, getCompanyDepartments, getCompanyPositions,
  createDepartment, renameDepartment, deleteDepartment, setDepartmentParent, moveDepartment, assignEmployeeDepartment,
  createPosition, renamePosition, deletePosition, movePosition, assignEmployeePosition, setPositionProjectVisibility,
} from '../services/storage';
import { buildDeptTree, flattenDeptTree, DEPT_INDENT } from '../utils/deptTree';

const ALL_KEY = '__all__';
// 부서 사이드바 폭 범위. 가장 긴 부서명에 맞춰 이 범위 안에서 자동으로 늘어난다(SIDEBAR_MIN_WIDTH~SIDEBAR_MAX_WIDTH).
const SIDEBAR_MIN_WIDTH = 90;
const SIDEBAR_MAX_WIDTH = 160;
const SIDEBAR_PADDING_H = 10;

// 특정 부서 자신 + 모든 하위 부서의 id 집합. 상위 부서 선택 chip에서 자기 자신/자손을 제외할 때 사용.
function collectSelfAndDescendantIds(departments, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of departments) {
      if (ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        changed = true;
      }
    }
  }
  return ids;
}

// 검색 + 목록 형태의 부서 선택 콤보박스. 상위 부서 선택, 직원 소속 부서 배정에서 공용으로 사용.
function DeptPickerModal({ visible, onClose, title, search, onSearchChange, items, selectedId, onSelect, noneLabel, searchPlaceholder = '부서명 검색' }) {
  const q = search.trim().toLowerCase();
  const filtered = items.filter((d) => !q || d.name.toLowerCase().includes(q));
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.sheetBase, s.pickerSheet]}>
          <View style={s.pickerHeader}>
            <TouchableOpacity onPress={onClose} style={s.pickerHeaderBtn}>
              <Text style={s.pickerCancelText}>취소</Text>
            </TouchableOpacity>
            <Text style={s.pickerTitle}>{title}</Text>
            <View style={s.pickerHeaderBtn} />
          </View>

          <View style={s.pickerSearchWrap}>
            <TextInput
              style={s.pickerSearchInput}
              value={search}
              onChangeText={onSearchChange}
              placeholder={searchPlaceholder}
              placeholderTextColor={C.textDim}
              autoCorrect={false}
              autoFocus
            />
          </View>

          <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
            {!q && !!noneLabel && (
              <TouchableOpacity
                style={[s.pickerRow, selectedId === null && s.pickerRowSelected]}
                onPress={() => onSelect(null)}
                activeOpacity={0.7}
              >
                <View style={s.pickerNameWrap}>
                  <Text style={[s.pickerName, selectedId === null && s.pickerNameSelected]}>{noneLabel}</Text>
                </View>
                <View style={[s.pickerCheck, selectedId === null && s.pickerCheckSelected]}>
                  {selectedId === null && <Text style={s.pickerCheckMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            )}
            {filtered.length === 0 ? (
              <Text style={s.pickerEmptyText}>{q ? '검색 결과가 없습니다' : '선택 가능한 부서가 없습니다'}</Text>
            ) : (
              filtered.map((d) => {
                const selected = selectedId === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.pickerRow, selected && s.pickerRowSelected]}
                    onPress={() => onSelect(d.id)}
                    activeOpacity={0.7}
                  >
                    <View style={s.pickerNameWrap}>
                      <Text style={[s.pickerName, selected && s.pickerNameSelected]} numberOfLines={1}>{d.name}</Text>
                    </View>
                    <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                      {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={s.spacerH40} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function CompanyScreen() {
  const insets = useSafeAreaInsets();
  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(ALL_KEY);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptParentId, setNewDeptParentId] = useState(null);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  const [parentPickerFor, setParentPickerFor] = useState(null); // null | 'new' | 기존 부서 id
  const [parentSearch, setParentSearch] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [positions, setPositions] = useState([]);
  const [newPositionName, setNewPositionName] = useState('');
  const [editingPositionId, setEditingPositionId] = useState(null);
  const [editingPositionName, setEditingPositionName] = useState('');

  // 회사관리 메인 목록에서 직원(관리자 본인 포함)을 탭했을 때 여는 부서/직책 수정 모달.
  const [employeeEditFor, setEmployeeEditFor] = useState(null); // { id, name, departmentId, positionId } — departmentId/positionId는 원래 값(변경 여부 비교용)
  const [employeeEditDeptId, setEmployeeEditDeptId] = useState(null);
  const [employeeEditPositionId, setEmployeeEditPositionId] = useState(null);
  const [employeeEditDeptPickerOpen, setEmployeeEditDeptPickerOpen] = useState(false);
  const [employeeEditPositionPickerOpen, setEmployeeEditPositionPickerOpen] = useState(false);
  const [employeeEditPickerSearch, setEmployeeEditPickerSearch] = useState('');
  const [savingEmployeeEdit, setSavingEmployeeEdit] = useState(false);

  const swipeDeptModal = useSwipeClose(() => setShowDeptModal(false), showDeptModal);
  const swipeRoleModal = useSwipeClose(() => setShowRoleModal(false), showRoleModal);

  async function load() {
    setLoading(true);
    try {
      setEmployeeGroups(await getCompanyEmployees());
    } catch {
      Alert.alert('오류', '회사 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDepartments() {
    try {
      setDepartments(await getCompanyDepartments());
    } catch {
      Alert.alert('오류', '부서 목록을 불러오지 못했습니다.');
    }
  }

  async function loadPositions() {
    try {
      setPositions(await getCompanyPositions());
    } catch {
      Alert.alert('오류', '직책 목록을 불러오지 못했습니다.');
    }
  }

  async function refreshAll() {
    await Promise.all([load(), loadDepartments(), loadPositions()]);
  }

  // 사이드바 트리 들여쓰기 계산에 departments(parentId 포함)가 필요하므로 화면 진입 시 부서 목록도 함께 로드한다.
  useFocusEffect(useCallback(() => { refreshAll(); }, []));

  function openDeptModal() {
    setEditingDeptId(null);
    setEditingDeptName('');
    setNewDeptName('');
    setNewDeptParentId(null);
    setParentPickerFor(null);
    setParentSearch('');
    setShowDeptModal(true);
    loadDepartments();
  }

  async function handleAddDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    try {
      await createDepartment(name, newDeptParentId);
      setNewDeptName('');
      setNewDeptParentId(null);
      await refreshAll();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function openParentPicker(target) {
    setParentPickerFor(target);
    setParentSearch('');
  }

  async function handleSetParent(deptId, parentId) {
    try {
      await setDepartmentParent(deptId, parentId);
      setParentPickerFor(null);
      await refreshAll();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function startEditDept(dept) {
    setEditingDeptId(dept.id);
    setEditingDeptName(dept.name);
  }

  function cancelEditDept() {
    setEditingDeptId(null);
    setEditingDeptName('');
  }

  async function confirmEditDept() {
    const name = editingDeptName.trim();
    if (!name) return;
    try {
      await renameDepartment(editingDeptId, name);
      cancelEditDept();
      await refreshAll();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  async function handleMoveDepartment(deptId, direction) {
    try {
      await moveDepartment(deptId, direction);
      await loadDepartments();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function handleDeleteDepartment(dept) {
    Alert.alert(
      '부서 삭제',
      `"${dept.name}" 부서를 삭제하시겠습니까?\n삭제하면 소속 직원은 미배정으로 바뀝니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDepartment(dept.id);
              await refreshAll();
            } catch (error) {
              Alert.alert('오류', error.message);
            }
          },
        },
      ]
    );
  }

  function openRoleModal() {
    setEditingPositionId(null);
    setEditingPositionName('');
    setNewPositionName('');
    setShowRoleModal(true);
    loadPositions();
  }

  async function handleAddPosition() {
    const name = newPositionName.trim();
    if (!name) return;
    try {
      await createPosition(name);
      setNewPositionName('');
      await loadPositions();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function startEditPosition(pos) {
    setEditingPositionId(pos.id);
    setEditingPositionName(pos.name);
  }

  function cancelEditPosition() {
    setEditingPositionId(null);
    setEditingPositionName('');
  }

  async function confirmEditPosition() {
    const name = editingPositionName.trim();
    if (!name) return;
    try {
      await renamePosition(editingPositionId, name);
      cancelEditPosition();
      await loadPositions();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function handleDeletePosition(pos) {
    Alert.alert(
      '직책 삭제',
      `"${pos.name}" 직책을 삭제하시겠습니까?\n삭제하면 이 직책으로 지정된 직원은 미배정으로 바뀝니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePosition(pos.id);
              await refreshAll();
            } catch (error) {
              Alert.alert('오류', error.message);
            }
          },
        },
      ]
    );
  }

  async function handleMovePosition(positionId, direction) {
    try {
      await movePosition(positionId, direction);
      await loadPositions();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  // 켜면 이 직책으로 배정된 직원이 프로젝트 메뉴 "회사 전체" 보기에서 본인 직급 이하(직책 목록에서
  // 같거나 아래에 있는) 동료의 프로젝트를 조회할 수 있게 된다.
  async function handleTogglePositionVisibility(positionId, enabled) {
    try {
      await setPositionProjectVisibility(positionId, enabled);
      await loadPositions();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  // 회사관리 메인 목록의 직원 카드를 탭하면 연다(관리자 본인 카드도 예외 없이 동일하게 동작).
  function openEmployeeEdit(employee) {
    setEmployeeEditFor({ id: employee.id, name: employee.name, departmentId: employee.departmentId ?? null, positionId: employee.positionId ?? null });
    setEmployeeEditDeptId(employee.departmentId ?? null);
    setEmployeeEditPositionId(employee.positionId ?? null);
    setEmployeeEditPickerSearch('');
  }

  async function handleSaveEmployeeEdit() {
    setSavingEmployeeEdit(true);
    try {
      const tasks = [];
      if (employeeEditDeptId !== employeeEditFor.departmentId) {
        tasks.push(assignEmployeeDepartment(employeeEditFor.id, employeeEditDeptId));
      }
      if (employeeEditPositionId !== employeeEditFor.positionId) {
        tasks.push(assignEmployeePosition(employeeEditFor.id, employeeEditPositionId));
      }
      await Promise.all(tasks);
      setEmployeeEditFor(null);
      await refreshAll();
    } catch (error) {
      Alert.alert('오류', error.message);
    } finally {
      setSavingEmployeeEdit(false);
    }
  }

  const totalEmployeeCount = employeeGroups.reduce((sum, g) => sum + g.employees.length, 0);

  const deptTree = buildDeptTree(departments);
  const flatDeptTree = flattenDeptTree(deptTree);

  // 선택된 부서가 최신 부서 트리에 더 이상 없으면(삭제 등) "전체"로 자동 복귀. 직원이 0명인 부서도 유효한 선택으로 취급한다.
  const effectiveSelectedDept = selectedDept !== ALL_KEY && flatDeptTree.some((d) => d.name === selectedDept)
    ? selectedDept
    : ALL_KEY;
  const showAll = effectiveSelectedDept === ALL_KEY;
  // 전체 보기에서는 인원이 0명인 부서도 트리 구조(├─/└─)가 끊기지 않도록 flatDeptTree 기준으로 모든 부서를 표시하고,
  // 실제 직원은 이름으로 매칭해 채워 넣는다. 부서가 없는 미배정 직원은 맨 끝에 별도로 붙인다.
  const employeesByDeptName = new Map(employeeGroups.map((g) => [g.departmentName, g.employees]));
  const unassignedGroup = employeeGroups.find((g) => g.departmentName === '미배정');
  const allDeptGroups = flatDeptTree.map((dept) => ({
    departmentName: dept.name,
    employees: employeesByDeptName.get(dept.name) || [],
    depth: dept.depth,
    isLast: dept.isLast,
  }));
  const showAllGroups = unassignedGroup
    ? [...allDeptGroups, { ...unassignedGroup, depth: 0, isLast: true }]
    : allDeptGroups;
  const visibleGroups = showAll
    ? showAllGroups
    : employeeGroups.filter((g) => g.departmentName === effectiveSelectedDept);
  const positionNameById = new Map(positions.map((p) => [p.id, p.name]));
  const positionOrderById = new Map(positions.map((p, idx) => [p.id, idx]));
  const positionOrderOf = (employee) =>
    employee.positionId != null && positionOrderById.has(employee.positionId) ? positionOrderById.get(employee.positionId) : Infinity;

  // 부서 관리 모달의 ▲▼ 버튼 활성/비활성 판정용: 부서는 전체 목록이 아니라 "같은 형제 그룹(같은
  // 상위 부서를 가진 부서들)" 내에서 처음/마지막인지로 판별해야 한다. departments는 서버에서
  // 이미 sort_order로 정렬되어 반환되므로, parentId별로 그룹핑한 뒤 그 안에서의 인덱스만 구하면 된다.
  const deptSiblingsByParent = new Map();
  for (const dept of departments) {
    const key = dept.parentId ?? '__root__';
    if (!deptSiblingsByParent.has(key)) deptSiblingsByParent.set(key, []);
    deptSiblingsByParent.get(key).push(dept.id);
  }
  const deptSiblingIndexById = new Map();
  for (const siblingIds of deptSiblingsByParent.values()) {
    siblingIds.forEach((id, idx) => deptSiblingIndexById.set(id, { idx, count: siblingIds.length }));
  }

  // 전체 보기에서는 부서 구분 없이 이름 가나다순으로 표시. 특정 부서 선택 시에는 직책 순위(직책 관리에서
  // 설정한 상위→하위 순서, 동률 시 이름 가나다순)로 표시.
  const visibleEmployees = visibleGroups.flatMap((group) =>
    group.employees.map((employee) => ({ employee, departmentName: group.departmentName }))
  );
  if (showAll) {
    visibleEmployees.sort((a, b) => {
      const adminCompare = (b.employee.isCompanyAdmin ? 1 : 0) - (a.employee.isCompanyAdmin ? 1 : 0);
      if (adminCompare !== 0) return adminCompare;
      return a.employee.name.localeCompare(b.employee.name, 'ko');
    });
  } else {
    visibleEmployees.sort((a, b) => {
      const orderCompare = positionOrderOf(a.employee) - positionOrderOf(b.employee);
      if (orderCompare !== 0) return orderCompare;
      return a.employee.name.localeCompare(b.employee.name, 'ko');
    });
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>회사관리</Text>
          <Text style={s.headerSub}>부서별 직원 {totalEmployeeCount}명</Text>
        </View>
        <View style={s.headerBtnRow}>
          <TouchableOpacity style={s.deptManageBtn} onPress={openDeptModal} activeOpacity={0.75}>
            <Text style={s.deptManageBtnText}>부서 관리</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deptManageBtn} onPress={openRoleModal} activeOpacity={0.75}>
            <Text style={s.deptManageBtnText}>직책 관리</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.body}>
        <ScrollView style={s.sidebar} contentContainerStyle={s.sidebarContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={s.sidebarItem} onPress={() => setSelectedDept(ALL_KEY)} activeOpacity={0.6}>
            <Text style={[s.sidebarItemText, showAll && s.sidebarItemTextActive]} numberOfLines={1}>전체</Text>
          </TouchableOpacity>
          {flatDeptTree.map((dept) => {
            const active = !showAll && effectiveSelectedDept === dept.name;
            return (
              <TouchableOpacity
                key={dept.id}
                style={[s.sidebarItem, { marginLeft: dept.depth * DEPT_INDENT }]}
                onPress={() => setSelectedDept(dept.name)}
                activeOpacity={0.6}
              >
                <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]} numberOfLines={2}>
                  {dept.depth > 0 && <Text style={s.treePrefix}>{'└ '}</Text>}
                  {dept.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {!loading && visibleEmployees.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>{showAll ? '회사 직원이 없습니다' : '이 부서에 직원이 없습니다'}</Text>
            </View>
          ) : (
            visibleEmployees.map(({ employee, departmentName }) => {
              // 관리자는 직책 체계 밖의 역할이라 직책이 없는 게 정상이므로, 미배정이어도 "직책 미배정"을 표시하지 않는다.
              const positionLabel = positionNameById.get(employee.positionId) || (employee.isCompanyAdmin ? '' : '직책 미배정');
              return (
              <TouchableOpacity key={employee.id} style={s.card} onPress={() => openEmployeeEdit(employee)} activeOpacity={0.75}>
                <View style={s.cardTop}>
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardTitle} numberOfLines={1}>{employee.name}</Text>
                    <Text style={s.employeeRole} numberOfLines={1}>{departmentName}{positionLabel ? ` · ${positionLabel}` : ''}</Text>
                  </View>
                  {employee.isCompanyAdmin && (
                    <View style={s.adminBadge}>
                      <Text style={s.adminBadgeText}>관리자</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* ── 부서 관리 모달 ── */}
      <Modal visible={showDeptModal} animationType="slide" transparent onRequestClose={() => setShowDeptModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, s.deptModalMaxH, swipeDeptModal.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeDeptModal.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>부서 관리</Text>

              <Text style={s.sectionLabel}>부서 목록</Text>
              {flatDeptTree.length === 0 ? (
                <Text style={s.emptyText}>등록된 부서가 없습니다</Text>
              ) : (
                flatDeptTree.map((dept) => {
                  const siblingInfo = deptSiblingIndexById.get(dept.id);
                  const isFirstSibling = !siblingInfo || siblingInfo.idx === 0;
                  const isLastSibling = !siblingInfo || siblingInfo.idx === siblingInfo.count - 1;
                  return (
                  <View key={dept.id} style={{ marginLeft: dept.depth * DEPT_INDENT }}>
                    <View style={s.deptRow}>
                      {editingDeptId === dept.id ? (
                        <>
                          <TextInput
                            style={[s.input, s.deptEditInput]}
                            value={editingDeptName}
                            onChangeText={setEditingDeptName}
                            placeholder="부서명"
                            placeholderTextColor={C.textDim}
                            autoFocus
                            onSubmitEditing={confirmEditDept}
                          />
                          <TouchableOpacity style={s.deptRowBtn} onPress={confirmEditDept}>
                            <Text style={s.deptRowBtnTextConfirm}>확인</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.deptRowBtn} onPress={cancelEditDept}>
                            <Text style={s.deptRowBtnText}>취소</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity style={s.deptRowNameWrap} onPress={() => startEditDept(dept)} activeOpacity={0.7}>
                            <Text style={s.deptRowName} numberOfLines={1}>{dept.name}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.deptRowBtn} onPress={() => handleMoveDepartment(dept.id, 'up')} disabled={isFirstSibling}>
                            <Text style={[s.deptRowBtnTextParent, isFirstSibling && s.deptRowBtnDisabled]}>▲</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.deptRowBtn} onPress={() => handleMoveDepartment(dept.id, 'down')} disabled={isLastSibling}>
                            <Text style={[s.deptRowBtnTextParent, isLastSibling && s.deptRowBtnDisabled]}>▼</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.deptRowBtn} onPress={() => openParentPicker(dept.id)}>
                            <Text style={s.deptRowBtnTextParent}>상위 부서 변경</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.deptRowBtn} onPress={() => handleDeleteDepartment(dept)}>
                            <Text style={s.deptRowBtnTextDelete}>삭제</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                  );
                })
              )}

              <Text style={s.sectionLabel}>상위 부서 (선택)</Text>
              <TouchableOpacity style={s.pickerTrigger} onPress={() => openParentPicker('new')} activeOpacity={0.8}>
                <Text style={[s.pickerTriggerText, newDeptParentId && s.pickerTriggerTextActive]} numberOfLines={1}>
                  {newDeptParentId ? (flatDeptTree.find((d) => d.id === newDeptParentId)?.name || '최상위') : '최상위'}
                </Text>
              </TouchableOpacity>

              <View style={s.deptAddRow}>
                <TextInput
                  style={[s.input, s.flex1]}
                  value={newDeptName}
                  onChangeText={setNewDeptName}
                  placeholder="새 부서명"
                  placeholderTextColor={C.textDim}
                  onSubmitEditing={handleAddDepartment}
                />
                <TouchableOpacity style={s.deptAddBtn} onPress={handleAddDepartment}>
                  <Text style={s.deptAddBtnText}>추가</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {(() => {
        const isNew = parentPickerFor === 'new';
        const excludedIds = isNew || !parentPickerFor ? new Set() : collectSelfAndDescendantIds(departments, parentPickerFor);
        const candidates = flatDeptTree.filter((d) => !excludedIds.has(d.id));
        const currentParentId = isNew ? newDeptParentId : (departments.find((d) => d.id === parentPickerFor)?.parentId ?? null);

        function choose(id) {
          if (isNew) {
            setNewDeptParentId(id);
            setParentPickerFor(null);
          } else {
            handleSetParent(parentPickerFor, id);
          }
        }

        return (
          <DeptPickerModal
            visible={!!parentPickerFor}
            onClose={() => setParentPickerFor(null)}
            title="상위 부서 선택"
            search={parentSearch}
            onSearchChange={setParentSearch}
            items={candidates}
            selectedId={currentParentId}
            onSelect={choose}
            noneLabel="최상위"
          />
        );
      })()}

      {/* ── 직책 관리 모달(관리자 전용) — 직책의 상하 순서를 관리한다(직원 배정은 직원 카드를 탭해서 연다) ── */}
      <Modal visible={showRoleModal} animationType="slide" transparent onRequestClose={() => setShowRoleModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, s.deptModalMaxH, swipeRoleModal.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeRoleModal.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>직책 관리</Text>

              <Text style={s.sectionLabel}>직책 목록 (상위 → 하위 순)</Text>
              {positions.length === 0 ? (
                <Text style={s.emptyText}>등록된 직책이 없습니다</Text>
              ) : (
                positions.map((pos, idx) => (
                  <View key={pos.id} style={s.positionRow}>
                    {editingPositionId === pos.id ? (
                      <View style={s.positionRowLine1}>
                        <TextInput
                          style={[s.input, s.deptEditInput, s.positionEditInput]}
                          value={editingPositionName}
                          onChangeText={setEditingPositionName}
                          placeholder="직책명"
                          placeholderTextColor={C.textDim}
                          autoFocus
                          onSubmitEditing={confirmEditPosition}
                        />
                        <TouchableOpacity style={s.deptRowBtn} onPress={confirmEditPosition}>
                          <Text style={s.deptRowBtnTextConfirm}>확인</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.deptRowBtn} onPress={cancelEditPosition}>
                          <Text style={s.deptRowBtnText}>취소</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        {/* 이름/▲▼삭제/하위 프로젝트 조회 허용을 모두 한 줄(같은 y축)에 배치한다.
                            라벨은 flexShrink로 좁은 화면에서 줄어들되 numberOfLines={1}로 잘리지 않게 유지한다. */}
                        <View style={s.positionRowLine1}>
                          <TouchableOpacity style={[s.deptRowNameWrap, s.positionRowNameWrap]} onPress={() => startEditPosition(pos)} activeOpacity={0.7}>
                            <Text style={s.deptRowName} numberOfLines={1}>{pos.name}</Text>
                          </TouchableOpacity>
                          <View style={s.positionRowBtnGroup}>
                            <TouchableOpacity style={s.deptRowBtn} onPress={() => handleMovePosition(pos.id, 'up')} disabled={idx === 0}>
                              <Text style={[s.deptRowBtnTextParent, idx === 0 && s.deptRowBtnDisabled]}>▲</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.deptRowBtn} onPress={() => handleMovePosition(pos.id, 'down')} disabled={idx === positions.length - 1}>
                              <Text style={[s.deptRowBtnTextParent, idx === positions.length - 1 && s.deptRowBtnDisabled]}>▼</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.deptRowBtn} onPress={() => handleDeletePosition(pos)}>
                              <Text style={s.deptRowBtnTextDelete}>삭제</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={s.positionVisibilityInlineLabel} numberOfLines={1}>하위 프로젝트 조회 허용</Text>
                          <Switch
                            value={!!pos.canViewSubordinateProjects}
                            onValueChange={(v) => handleTogglePositionVisibility(pos.id, v)}
                            trackColor={{ false: C.border, true: C.red + '88' }}
                            thumbColor={pos.canViewSubordinateProjects ? C.red : C.textDim}
                          />
                        </View>
                      </>
                    )}
                  </View>
                ))
              )}

              {/* 입력칸을 flex:1 대신 이름 칸(positionRowNameWrap)과 같은 폭(120)으로 고정해
                  "추가" 버튼이 위 목록의 ▲▼삭제/확인·취소 버튼과 같은 x축 위치에 오도록 맞춘다. */}
              <View style={s.deptAddRow}>
                <TextInput
                  style={[s.input, s.positionEditInput]}
                  value={newPositionName}
                  onChangeText={setNewPositionName}
                  placeholder="새 직책명"
                  placeholderTextColor={C.textDim}
                  onSubmitEditing={handleAddPosition}
                />
                <TouchableOpacity style={s.deptAddBtn} onPress={handleAddPosition}>
                  <Text style={s.deptAddBtnText}>추가</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 직원 정보 수정 모달(관리자 전용) — 회사관리 목록에서 직원(관리자 본인 포함)을 탭하면 열린다 ── */}
      <Modal visible={!!employeeEditFor} animationType="slide" transparent onRequestClose={() => setEmployeeEditFor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.sheetBase, s.modalSheet]}>
            <View style={s.modalHandleWrap}>
              <View style={s.modalHandle} />
            </View>
            <Text style={s.modalTitle}>직원 정보 수정</Text>
            <Text style={s.employeeEditSubTitle}>{employeeEditFor?.name}</Text>

            <Text style={s.sectionLabel}>소속 부서</Text>
            <TouchableOpacity style={s.pickerTrigger} onPress={() => { setEmployeeEditPickerSearch(''); setEmployeeEditDeptPickerOpen(true); }} activeOpacity={0.8}>
              <Text style={[s.pickerTriggerText, employeeEditDeptId && s.pickerTriggerTextActive]} numberOfLines={1}>
                {departments.find((d) => d.id === employeeEditDeptId)?.name || '미배정'}
              </Text>
            </TouchableOpacity>

            <Text style={[s.sectionLabel, s.employeeSectionLabel]}>직책</Text>
            <TouchableOpacity style={s.pickerTrigger} onPress={() => { setEmployeeEditPickerSearch(''); setEmployeeEditPositionPickerOpen(true); }} activeOpacity={0.8}>
              <Text style={[s.pickerTriggerText, employeeEditPositionId && s.pickerTriggerTextActive]} numberOfLines={1}>
                {positionNameById.get(employeeEditPositionId) || '미배정'}
              </Text>
            </TouchableOpacity>

            <View style={s.employeeEditBtns}>
              <TouchableOpacity style={s.deptRowBtn} onPress={() => setEmployeeEditFor(null)}>
                <Text style={s.deptRowBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deptAddBtn} onPress={handleSaveEmployeeEdit} disabled={savingEmployeeEdit}>
                <Text style={s.deptAddBtnText}>{savingEmployeeEdit ? '저장 중…' : '저장'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DeptPickerModal
        visible={employeeEditDeptPickerOpen}
        onClose={() => setEmployeeEditDeptPickerOpen(false)}
        title="소속 부서 선택"
        search={employeeEditPickerSearch}
        onSearchChange={setEmployeeEditPickerSearch}
        items={departments}
        selectedId={employeeEditDeptId}
        onSelect={(id) => { setEmployeeEditDeptId(id); setEmployeeEditDeptPickerOpen(false); }}
        noneLabel="미배정"
      />

      <DeptPickerModal
        visible={employeeEditPositionPickerOpen}
        onClose={() => setEmployeeEditPositionPickerOpen(false)}
        title="직책 선택"
        search={employeeEditPickerSearch}
        onSearchChange={setEmployeeEditPickerSearch}
        items={positions}
        selectedId={employeeEditPositionId}
        onSelect={(id) => { setEmployeeEditPositionId(id); setEmployeeEditPositionPickerOpen(false); }}
        noneLabel="미배정"
        searchPlaceholder="직책명 검색"
      />
    </View>
  );
}

const s = StyleSheet.create({
  // PC는 좌측 PCSidebar(App.js)와 화면 콘텐츠 사이에 여백을 둬서 헤더·부서 사이드바가
  // 내비게이션 사이드바에 바로 붙어 묻혀 보이지 않게 한다. 모바일은 영향 없음(0).
  root: { flex: 1, backgroundColor: C.bg, paddingLeft: IS_PC ? 24 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },

  body: { flex: 1, flexDirection: 'row' },

  // flexBasis:'auto' + minWidth/maxWidth로 가장 긴 부서명에 맞춰 그 범위 안에서 자동으로 늘어난다.
  // 부서명 Text는 numberOfLines를 주지 않아 넘치면 줄바꿈되며(말줄임 없음), 한글은 글자 단위로 줄바꿈되므로
  // 웹에서도 이 폭 이상으로 강제로 넓어지지 않는다.
  sidebar: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: SIDEBAR_MIN_WIDTH, maxWidth: SIDEBAR_MAX_WIDTH, borderRightWidth: 1, borderRightColor: C.border },
  sidebarContent: { paddingHorizontal: SIDEBAR_PADDING_H, paddingTop: 12, paddingBottom: 100, gap: 8 },
  sidebarItem: { alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 4 },
  sidebarItemText: { color: C.textDim, fontSize: 12, fontWeight: '500' },
  sidebarItemTextActive: { color: C.companyIndigo, fontWeight: '600' },
  treePrefix: { color: C.textDim, fontWeight: '400' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 10 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },

  adminBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.companyIndigo + '66', backgroundColor: C.companyIndigo + '18' },
  adminBadgeText: { color: C.companyIndigo, fontSize: 10, fontWeight: '600' },
  employeeRole: { color: C.textSecondary, fontSize: 12, flex: 1, marginLeft: 8, textAlign: 'right' },

  card: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flexShrink: 0 },

  headerBtnRow: { flexDirection: 'row', gap: 8 },
  deptManageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.companyIndigo + '66', backgroundColor: C.companyIndigo + '18' },
  deptManageBtnText: { color: C.companyIndigo, fontSize: 12, fontWeight: '600' },

  // Modal (웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다)
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetBase: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalSheet: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  deptModalMaxH: { maxHeight: '90%' },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 12 },

  // 상위 부서 선택 콤보박스 (검색 + 목록)
  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pickerTriggerText: { color: C.textDim, fontSize: 14 },
  pickerTriggerTextActive: { color: C.textPrimary },
  pickerSheet: { height: '70%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerHeaderBtn: { minWidth: 52 },
  pickerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  pickerCancelText: { color: C.textSecondary, fontSize: 15 },
  pickerSearchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSearchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  pickerList: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowSelected: { backgroundColor: C.companyIndigo + '0D' },
  pickerNameWrap: { flex: 1 },
  pickerName: { color: C.textPrimary, fontSize: 14 },
  pickerNameSelected: { color: C.companyIndigo, fontWeight: '500' },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerCheckSelected: { backgroundColor: C.companyIndigo, borderColor: C.companyIndigo },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickerEmptyText: { color: C.textDim, fontSize: 12, padding: 20, textAlign: 'center' },
  spacerH40: { height: 40 },

  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 },
  employeeSectionLabel: { marginTop: 24 },

  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  flex1: { flex: 1 },

  deptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  // 이름/▲▼삭제/하위 프로젝트 조회 허용을 전부 한 줄(같은 y축)에 둔다 — 버튼 그룹까지는 고정폭이라
  // 안 줄어들고, 라벨(positionVisibilityInlineLabel)만 flexShrink로 좁은 화면에서 줄어든다.
  positionRow: { flexDirection: 'column', marginBottom: 10 },
  positionRowLine1: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // ▲/▼/삭제 버튼끼리는 이름-버튼그룹 간격(gap:6)보다 좁게 붙인다.
  positionRowBtnGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deptRowNameWrap: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  // deptRowNameWrap의 flex:1을 이 너비 고정 오버라이드로 덮어써야 하는데, `flex` 축약 속성은
  // RN/Yoga에서 flexBasis까지 함께 재설정하는 합성 속성이라 width와 섞어 쓰면 레이아웃이 0으로
  // 찌그러져 텍스트가 안 보이는 경우가 있다(탭은 되므로 편집 모드 진입 시 TextInput에는 값이
  // 정상 표시됨 — 그래서 "편집할 때만 보인다"는 증상으로 나타남). flex 대신 개별 속성(flexGrow/
  // flexShrink)만 써서 이 문제를 피한다.
  positionRowNameWrap: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 146, paddingHorizontal: 10 },
  positionVisibilityInlineLabel: { color: C.textDim, fontSize: 10, flexShrink: 1, flexGrow: 1, textAlign: 'right' },
  deptRowName: { color: C.textPrimary, fontSize: 14 },
  deptEditInput: { flex: 1 },
  // 직책 이름변경 입력칸은 flex:1로 늘어나면 확인/취소 버튼이 표시모드의 ▲▼삭제 버튼과
  // 다른 위치로 밀려나 수평이 안 맞아 보인다 — 이름 칸(positionRowNameWrap)과 같은 폭(146)으로 고정.
  positionEditInput: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 146 },
  deptRowBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  deptRowBtnText: { color: C.textSecondary, fontSize: 13 },
  deptRowBtnTextConfirm: { color: C.companyIndigo, fontSize: 13, fontWeight: '600' },
  deptRowBtnTextParent: { color: C.companyIndigo, fontSize: 12 },
  deptRowBtnTextDelete: { color: C.red, fontSize: 13 },
  deptRowBtnDisabled: { color: C.textDim, opacity: 0.4 },

  deptAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  deptAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: C.companyIndigo },
  deptAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  employeeEditSubTitle: { color: C.textSecondary, fontSize: 13, marginBottom: 16 },
  employeeEditBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
});
