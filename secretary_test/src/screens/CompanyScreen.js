import { Text, View, ScrollView, StyleSheet } from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { getCompanyEmployees } from '../services/storage';

export default function CompanyScreen() {
  const insets = useSafeAreaInsets();
  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useFocusEffect(useCallback(() => { load(); }, []));

  const totalEmployeeCount = employeeGroups.reduce((sum, g) => sum + g.employees.length, 0);

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>회사관리</Text>
          <Text style={s.headerSub}>부서별 직원 {totalEmployeeCount}명</Text>
        </View>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {!loading && employeeGroups.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>회사 직원이 없습니다</Text>
          </View>
        ) : (
          employeeGroups.map((group) => (
            <View key={group.departmentName} style={s.deptSection}>
              <View style={s.deptHeaderRow}>
                <Text style={s.deptName}>{group.departmentName}</Text>
                <Text style={s.deptMeta}>{group.employees.length}명</Text>
              </View>
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
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },

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
});
