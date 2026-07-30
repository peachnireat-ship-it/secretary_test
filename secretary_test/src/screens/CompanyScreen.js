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
  createDepartment, renameDepartment, deleteDepartment, assignEmployeeDepartment,
} from '../services/storage';

const ALL_KEY = '__all__';

export default function CompanyScreen() {
  const insets = useSafeAreaInsets();
  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(ALL_KEY);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingDeptName, setEditingDeptName] = useState('');

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

  useFocusEffect(useCallback(() => { load(); }, []));

  function openDeptModal() {
    setEditingDeptId(null);
    setEditingDeptName('');
    setNewDeptName('');
    setShowDeptModal(true);
    loadDepartments();
  }

  async function handleAddDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    try {
      await createDepartment(name);
      setNewDeptName('');
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

  const totalEmployeeCount = employeeGroups.reduce((sum, g) => sum + g.employees.length, 0);
  const allEmployees = employeeGroups.flatMap((g) => g.employees);

  // 선택된 부서가 최신 목록에 더 이상 없으면(직원 이동 등) "전체"로 자동 복귀
  const effectiveSelectedDept = selectedDept !== ALL_KEY && employeeGroups.some((g) => g.departmentName === selectedDept)
    ? selectedDept
    : ALL_KEY;
  const showAll = effectiveSelectedDept === ALL_KEY;
  const visibleGroups = showAll
    ? employeeGroups
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
          <TouchableOpacity
            style={[s.sidebarItem, showAll && s.sidebarItemActive]}
            onPress={() => setSelectedDept(ALL_KEY)}
            activeOpacity={0.75}
          >
            <Text style={[s.sidebarItemText, showAll && s.sidebarItemTextActive]} numberOfLines={1}>전체</Text>
          </TouchableOpacity>
          {employeeGroups.map((group) => {
            const active = !showAll && effectiveSelectedDept === group.departmentName;
            return (
              <TouchableOpacity
                key={group.departmentName}
                style={[s.sidebarItem, active && s.sidebarItemActive]}
                onPress={() => setSelectedDept(group.departmentName)}
                activeOpacity={0.75}
              >
                <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]} numberOfLines={1}>{group.departmentName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {!loading && employeeGroups.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>회사 직원이 없습니다</Text>
            </View>
          ) : (
            visibleGroups.map((group) => (
              <View key={group.departmentName} style={s.deptSection}>
                {showAll && (
                  <View style={s.deptHeaderRow}>
                    <Text style={s.deptName}>{group.departmentName}</Text>
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
            ))
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
              {departments.length === 0 ? (
                <Text style={s.emptyText}>등록된 부서가 없습니다</Text>
              ) : (
                departments.map((dept) => (
                  <View key={dept.id} style={s.deptRow}>
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
                        <TouchableOpacity style={s.deptRowBtn} onPress={() => handleDeleteDepartment(dept)}>
                          <Text style={s.deptRowBtnTextDelete}>삭제</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))
              )}

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
                      <Text style={s.employeeAssignCurrent} numberOfLines={1}>
                        {departments.find((d) => d.id === employee.departmentId)?.name || '미배정'}
                      </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                      <TouchableOpacity
                        style={[s.chip, employee.departmentId === null && s.chipActive]}
                        onPress={() => handleAssignEmployee(employee.id, null)}
                      >
                        <Text style={[s.chipText, employee.departmentId === null && s.chipTextActive]}>미배정</Text>
                      </TouchableOpacity>
                      {departments.map((dept) => (
                        <TouchableOpacity
                          key={dept.id}
                          style={[s.chip, employee.departmentId === dept.id && s.chipActive]}
                          onPress={() => handleAssignEmployee(employee.id, dept.id)}
                        >
                          <Text style={[s.chipText, employee.departmentId === dept.id && s.chipTextActive]} numberOfLines={1}>{dept.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },

  body: { flex: 1, flexDirection: 'row' },

  sidebar: { width: 88, borderRightWidth: 1, borderRightColor: C.border },
  sidebarContent: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 100, gap: 8 },
  sidebarItem: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  sidebarItemActive: { borderColor: C.companyIndigo + '88', backgroundColor: C.companyIndigo + '18' },
  sidebarItemText: { color: C.textDim, fontSize: 12, fontWeight: '500' },
  sidebarItemTextActive: { color: C.companyIndigo, fontWeight: '600' },

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
  deptRowBtnTextDelete: { color: C.red, fontSize: 13 },

  deptAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  deptAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: C.companyIndigo },
  deptAddBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  employeeAssignRow: { marginBottom: 16, gap: 8 },
  employeeAssignHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  employeeAssignName: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10 },
  employeeAssignCurrent: { color: C.textDim, fontSize: 11 },

  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActive: { borderColor: C.companyIndigo + '88', backgroundColor: C.companyIndigo + '22' },
  chipText: { color: C.textDim, fontSize: 12 },
  chipTextActive: { color: C.companyIndigo, fontWeight: '500' },
});
