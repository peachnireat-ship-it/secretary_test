import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { useSwipeClose } from '../hooks/useSwipeClose';
import {
  getCompanyEmployees, getCompanyDepartments,
  createDepartment, renameDepartment, deleteDepartment, setDepartmentParent, assignEmployeeDepartment,
} from '../services/storage';

const ALL_KEY = '__all__';
const DEPT_INDENT = 10;

// flat departments(id, name, parentId) 배열을 부모→자식 트리로 조립. 이미 방문한 id는 스킵해 순환 참조를 방어한다.
function buildDeptTree(departments, parentId = null, visited = new Set()) {
  return departments
    .filter((d) => (d.parentId || null) === parentId && !visited.has(d.id))
    .map((d) => ({ ...d, children: buildDeptTree(departments, d.id, new Set(visited).add(d.id)) }));
}

// 트리를 depth(들여쓰기 단계) 포함 평면 배열로 변환(부모 다음에 자식이 오는 순서 유지). 목록 렌더링·들여쓰기 계산에 사용.
// isLast는 사이드바에 ├─/└─ 가지 기호를 그릴 때 자기 형제 목록에서 마지막인지 표시하는 값.
function flattenDeptTree(nodes, depth = 0) {
  const out = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const { children, ...rest } = node;
    out.push({ ...rest, depth, isLast });
    out.push(...flattenDeptTree(children, depth + 1));
  });
  return out;
}

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
function DeptPickerModal({ visible, onClose, title, search, onSearchChange, items, selectedId, onSelect, noneLabel }) {
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
              placeholder="부서명 검색"
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
  const [employeeDeptPickerFor, setEmployeeDeptPickerFor] = useState(null); // 직원 id
  const [employeeDeptSearch, setEmployeeDeptSearch] = useState('');

  const swipeDeptModal = useSwipeClose(() => setShowDeptModal(false), showDeptModal);

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

  async function refreshAll() {
    await Promise.all([load(), loadDepartments()]);
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
    setEmployeeDeptPickerFor(null);
    setEmployeeDeptSearch('');
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

  function openEmployeeDeptPicker(employeeId) {
    setEmployeeDeptPickerFor(employeeId);
    setEmployeeDeptSearch('');
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

  async function handleAssignEmployee(employeeId, departmentId) {
    try {
      await assignEmployeeDepartment(employeeId, departmentId);
      await refreshAll();
    } catch (error) {
      Alert.alert('오류', error.message);
    }
  }

  function chooseEmployeeDept(departmentId) {
    handleAssignEmployee(employeeDeptPickerFor, departmentId);
    setEmployeeDeptPickerFor(null);
  }

  const totalEmployeeCount = employeeGroups.reduce((sum, g) => sum + g.employees.length, 0);
  const allEmployees = employeeGroups.flatMap((g) => g.employees);

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

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>회사관리</Text>
          <Text style={s.headerSub}>부서별 직원 {totalEmployeeCount}명</Text>
        </View>
        <TouchableOpacity style={s.deptManageBtn} onPress={openDeptModal} activeOpacity={0.75}>
          <Text style={s.deptManageBtnText}>부서 관리</Text>
        </TouchableOpacity>
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
                <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]} numberOfLines={1}>
                  {dept.depth > 0 && <Text style={s.treePrefix}>{'└ '}</Text>}
                  {dept.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {!loading && visibleGroups.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>{showAll ? '회사 직원이 없습니다' : '이 부서에 직원이 없습니다'}</Text>
            </View>
          ) : (
            visibleGroups.map((group) => {
              const groupDepth = group.depth ?? 0;
              return (
                <View key={group.departmentName} style={s.deptSection}>
                  {showAll && (
                    <View style={[s.deptHeaderRow, { marginLeft: groupDepth * DEPT_INDENT }]}>
                      <Text style={s.deptName}>
                        {groupDepth > 0 && <Text style={s.deptNamePrefix}>{'└ '}</Text>}
                        {group.departmentName}
                      </Text>
                      <Text style={s.deptMeta}>{group.employees.length}명</Text>
                    </View>
                  )}
                  {group.employees.map((employee) => (
                    <View key={employee.id} style={s.card}>
                      <View style={s.cardTop}>
                        <View style={s.cardTitleRow}>
                          <Text style={s.cardTitle} numberOfLines={1}>{employee.name}</Text>
                        </View>
                        {employee.isCompanyAdmin && (
                          <View style={s.adminBadge}>
                            <Text style={s.adminBadgeText}>관리자</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.employeeRole} numberOfLines={1}>{employee.role || '직책 미등록'}</Text>
                    </View>
                  ))}
                </View>
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
                flatDeptTree.map((dept) => (
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
                ))
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

              <Text style={[s.sectionLabel, s.employeeSectionLabel]}>직원별 소속 부서</Text>
              {allEmployees.length === 0 ? (
                <Text style={s.emptyText}>회사 직원이 없습니다</Text>
              ) : (
                allEmployees.map((employee) => (
                  <View key={employee.id} style={s.employeeAssignRow}>
                    <View style={s.employeeAssignHeader}>
                      <Text style={s.employeeAssignName} numberOfLines={1}>{employee.name}</Text>
                    </View>
                    <TouchableOpacity style={s.pickerTrigger} onPress={() => openEmployeeDeptPicker(employee.id)} activeOpacity={0.8}>
                      <Text style={[s.pickerTriggerText, employee.departmentId && s.pickerTriggerTextActive]} numberOfLines={1}>
                        {departments.find((d) => d.id === employee.departmentId)?.name || '미배정'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
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

      <DeptPickerModal
        visible={!!employeeDeptPickerFor}
        onClose={() => setEmployeeDeptPickerFor(null)}
        title="소속 부서 선택"
        search={employeeDeptSearch}
        onSearchChange={setEmployeeDeptSearch}
        items={departments}
        selectedId={allEmployees.find((e) => e.id === employeeDeptPickerFor)?.departmentId ?? null}
        onSelect={chooseEmployeeDept}
        noneLabel="미배정"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },

  body: { flex: 1, flexDirection: 'row' },

  sidebar: { width: 30, borderRightWidth: 1, borderRightColor: C.border },
  sidebarContent: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 100, gap: 8 },
  sidebarItem: { alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 4 },
  sidebarItemText: { color: C.textDim, fontSize: 12, fontWeight: '500' },
  sidebarItemTextActive: { color: C.companyIndigo, fontWeight: '600' },
  treePrefix: { color: C.textDim, fontWeight: '400' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 20 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },

  adminBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.companyIndigo + '66', backgroundColor: C.companyIndigo + '18' },
  adminBadgeText: { color: C.companyIndigo, fontSize: 10, fontWeight: '600' },
  employeeRole: { color: C.textSecondary, fontSize: 12 },

  deptSection: { gap: 10 },
  deptHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  deptName: { color: C.companyIndigo, fontSize: 15, fontWeight: '600' },
  deptNamePrefix: { color: C.textDim, fontWeight: '400' },
  deptMeta: { color: C.textDim, fontSize: 11 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },

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
  deptRowNameWrap: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  deptRowName: { color: C.textPrimary, fontSize: 14 },
  deptEditInput: { flex: 1 },
  deptRowBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  deptRowBtnText: { color: C.textSecondary, fontSize: 13 },
  deptRowBtnTextConfirm: { color: C.companyIndigo, fontSize: 13, fontWeight: '600' },
  deptRowBtnTextParent: { color: C.companyIndigo, fontSize: 12 },
  deptRowBtnTextDelete: { color: C.red, fontSize: 13 },

  deptAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  deptAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: C.companyIndigo },
  deptAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  employeeAssignRow: { marginBottom: 16, gap: 8 },
  employeeAssignHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  employeeAssignName: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10 },
});
