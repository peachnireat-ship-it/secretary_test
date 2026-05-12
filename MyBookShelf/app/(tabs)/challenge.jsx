import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useCallback, Fragment } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBooksByStatus } from '../../database/database';

const STEPS = 7;
const PURPLE = '#6750A4';
const PURPLE_LIGHT = '#E8DEF8';
const PURPLE_MID = '#D0BCFF';

function fmtDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function calcStepIdx(book, totalSteps) {
  if (book.status !== 'reading') return 0;
  const { startDate, goalDate } = book;
  if (!startDate || !goalDate || goalDate <= startDate) return 0;
  const ratio = Math.min(1, Math.max(0, (Date.now() - startDate) / (goalDate - startDate)));
  return Math.round(ratio * (totalSteps - 1));
}

function DaysBadge({ goalTs }) {
  if (!goalTs) return <Text style={styles.noGoalText}>목표일 없음</Text>;
  const days = Math.ceil((goalTs - Date.now()) / 86400000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const extra = days < 0 ? styles.badgeOver : days <= 7 ? styles.badgeUrgent : null;
  return (
    <View style={[styles.badge, extra]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function BoardTrack({ stepIdx }) {
  return (
    <View style={styles.track}>
      {Array.from({ length: STEPS }).map((_, i) => {
        const isFirst = i === 0;
        const isLast = i === STEPS - 1;
        const isPast = i < stepIdx;
        const isCurrent = i === stepIdx;

        const nodeExtra = isFirst || isLast
          ? styles.nodeSpecial
          : isPast
          ? styles.nodePast
          : isCurrent
          ? styles.nodeCurrent
          : styles.nodeFuture;

        const content = isFirst ? '📖'
          : isLast ? '🏆'
          : isPast ? '✓'
          : isCurrent ? '🔖'
          : String(i);

        const textStyle = isPast || isCurrent || isFirst || isLast
          ? styles.nodeTextLight
          : styles.nodeTextDark;

        return (
          <Fragment key={i}>
            {i > 0 && (
              <View style={[styles.connector, i <= stepIdx ? styles.connectorDone : styles.connectorTodo]} />
            )}
            <View style={[styles.node, nodeExtra, isCurrent && styles.nodeLarge]}>
              <Text style={textStyle}>{content}</Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const NODES_PER_ROW = 10;

function DynamicSnakeTrack({ stepIdx, totalSteps }) {
  const [trackWidth, setTrackWidth] = useState(0);

  const tiny = totalSteps > 30;
  const small = totalSteps > 14;
  const nodeSize = tiny ? 14 : small ? 18 : 24;
  const nodeFontSize = tiny ? 7 : small ? 9 : 11;
  const connHeight = tiny ? 10 : 14;

  const connectorWidth = trackWidth > 0
    ? Math.max(4, (trackWidth - NODES_PER_ROW * nodeSize) / (NODES_PER_ROW - 1))
    : 0;

  const rows = [];
  for (let start = 0; start < totalSteps; start += NODES_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(NODES_PER_ROW, totalSteps - start) }, (_, j) => start + j)
    );
  }

  const renderNode = (ni) => {
    const isFirst = ni === 0;
    const isLast = ni === totalSteps - 1;
    const isPast = ni < stepIdx;
    const isCurrent = ni === stepIdx;
    const extra = (isFirst || isLast) ? styles.nodeSpecial
      : isPast ? styles.nodePast
      : isCurrent ? styles.nodeCurrent
      : styles.nodeFuture;
    const content = isFirst ? '📖' : isLast ? '🏆'
      : isPast ? '✓' : isCurrent ? '🔖' : '·';
    const textStyle = (isPast || isCurrent || isFirst || isLast)
      ? styles.nodeTextLight : styles.nodeTextDark;
    const sizeStyle = { width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2 };
    return (
      <View style={[styles.node, extra, isCurrent && styles.nodeLarge, sizeStyle]}>
        <Text style={[textStyle, { fontSize: nodeFontSize }]}>{content}</Text>
      </View>
    );
  };

  const hConn = (done) => (
    <View style={[
      { width: connectorWidth, height: 4, borderRadius: 2 },
      done ? styles.connectorDone : styles.connectorTodo,
    ]} />
  );

  return (
    <View style={styles.snakeTrack} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      {trackWidth > 0 && rows.map((row, rowIdx) => {
        const isReverse = rowIdx % 2 === 1;
        const lastNodeInRow = row[row.length - 1];
        const isLastRow = rowIdx === rows.length - 1;
        const connJustify = isReverse ? 'flex-start' : 'flex-end';

        return (
          <Fragment key={rowIdx}>
            <View style={[styles.track, {
              flexDirection: isReverse ? 'row-reverse' : 'row',
              marginBottom: 0,
            }]}>
              {row.map((ni, i) => (
                <Fragment key={ni}>
                  {i > 0 && hConn(stepIdx >= ni)}
                  {renderNode(ni)}
                </Fragment>
              ))}
            </View>
            {!isLastRow && (
              <View style={{ flexDirection: 'row', justifyContent: connJustify }}>
                <View style={{ width: nodeSize, alignItems: 'center', paddingVertical: 2 }}>
                  <View style={[
                    { width: 4, height: connHeight, borderRadius: 2 },
                    stepIdx > lastNodeInRow ? styles.connectorDone : styles.connectorTodo,
                  ]} />
                </View>
              </View>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

function ChallengeCard({ book, onPress }) {
  const startTs = book.startDate || book.createdAt;
  const totalDays = (book.goalDate && startTs)
    ? Math.max(Math.ceil((book.goalDate - startTs) / 86400000), 1)
    : null;
  const totalSteps = totalDays !== null ? totalDays : STEPS;
  const stepIdx = calcStepIdx(book, totalSteps);
  const useSnake = totalDays !== null && totalDays >= 6;

  const startLabel = book.status === 'want_to_read'
    ? '시작 전'
    : fmtDate(startTs) ?? '?';

  const goalLabel = book.goalDate
    ? fmtDate(book.goalDate) + ' 목표'
    : '목표일 미설정 — 책 상세에서 설정';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
          {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        </View>
        <DaysBadge goalTs={book.goalDate} />
      </View>

      {useSnake
        ? <DynamicSnakeTrack stepIdx={stepIdx} totalSteps={totalSteps} />
        : <BoardTrack stepIdx={stepIdx} />}

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>{startLabel}</Text>
        <Text style={styles.dateLabel} numberOfLines={1}>{goalLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setBooks([
        ...getBooksByStatus('reading'),
        ...getBooksByStatus('want_to_read'),
      ]);
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.screenTitle}>독서 챌린지</Text>
      <Text style={styles.screenSub}>목표일을 향해 한 칸씩 나아가세요!</Text>

      {books.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📚</Text>
          <Text style={styles.emptyText}>읽는 중이거나 읽고 싶은 책이 없습니다</Text>
        </View>
      ) : (
        books.map((book) => (
          <ChallengeCard
            key={book.id}
            book={book}
            onPress={() => router.push(`/book/${book.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: '#1C1B1F', marginBottom: 4 },
  screenSub: { fontSize: 13, color: '#6B6278', marginBottom: 20 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F' },
  bookAuthor: { fontSize: 12, color: '#6B6278', marginTop: 2 },

  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: PURPLE_LIGHT,
  },
  badgeUrgent: { backgroundColor: '#FFF3E0' },
  badgeOver: { backgroundColor: '#FFEBEE' },
  badgeText: { fontSize: 12, fontWeight: '700', color: PURPLE },
  noGoalText: { fontSize: 12, color: '#CAC4D0', alignSelf: 'center' },

  track: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  connector: { flex: 1, height: 4, borderRadius: 2 },
  connectorDone: { backgroundColor: PURPLE },
  connectorTodo: { backgroundColor: PURPLE_LIGHT },

  node: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  nodeLarge: { width: 34, height: 34, borderRadius: 17 },
  nodeSpecial: { backgroundColor: PURPLE_MID },
  nodePast: { backgroundColor: PURPLE },
  nodeCurrent: { backgroundColor: PURPLE },
  nodeFuture: { backgroundColor: PURPLE_LIGHT, borderWidth: 1.5, borderColor: PURPLE_MID },
  nodeTextLight: { fontSize: 13, color: '#fff', fontWeight: '600' },
  nodeTextDark: { fontSize: 11, color: '#9E8FB2' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dateLabel: { fontSize: 11, color: '#9E8FB2', flexShrink: 1 },

  snakeTrack: { marginBottom: 12, flexDirection: 'column' },
  vertConnector: { width: 4, height: 20, borderRadius: 2 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },
});
