import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator } from 'react-native';
import { useState, useCallback, useRef, Fragment } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBooksByStatus, addCheckin, getSuccessfulChallengeBooks, getAllBooks, addXp, getPref, setPref, getReadStreak, getCheckinDays } from '../../database/database';

const STEPS = 7;
const PURPLE = '#6750A4';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
const PURPLE_LIGHT = '#E8DEF8';
const PURPLE_MID = '#D0BCFF';

function fmtDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function calcStepIdx(book, totalSteps) {
  if (book.status !== 'reading') return 0;
  const { goalDate } = book;
  const startDate = book.startDate || book.createdAt;
  if (!startDate || !goalDate) return 0;
  const startMidnight = new Date(startDate).setHours(0, 0, 0, 0);
  const goalMidnight = new Date(goalDate).setHours(0, 0, 0, 0);
  if (goalMidnight <= startMidnight) return 0;
  const todayMidnight = new Date().setHours(0, 0, 0, 0);
  const ratio = Math.min(1, Math.max(0, (todayMidnight - startMidnight) / (goalMidnight - startMidnight)));
  return Math.round(ratio * (totalSteps - 1));
}

function DaysBadge({ goalTs }) {
  if (!goalTs) return <Text style={styles.noGoalText}>목표일 없음</Text>;
  const todayMidnight = new Date().setHours(0, 0, 0, 0);
  const goalMidnight = new Date(goalTs).setHours(0, 0, 0, 0);
  const days = Math.round((goalMidnight - todayMidnight) / 86400000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const extra = days < 0 ? styles.badgeOver : days <= 7 ? styles.badgeUrgent : null;
  return (
    <View style={[styles.badge, extra]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function BoardTrack({ stepIdx, checkedInSteps }) {
  return (
    <View style={styles.track}>
      {Array.from({ length: STEPS }).map((_, i) => {
        const isFirst = i === 0;
        const isLast = i === STEPS - 1;
        const isPast = i < stepIdx;
        const isCurrent = i === stepIdx;
        const isCheckedIn = !isFirst && !isLast && checkedInSteps?.has(i);

        const nodeExtra = isFirst || isLast
          ? styles.nodeSpecial
          : isCheckedIn
          ? styles.nodeCheckedIn
          : isPast
          ? styles.nodePast
          : isCurrent
          ? styles.nodeCurrent
          : styles.nodeFuture;

        const content = isFirst ? '📖'
          : isLast ? '🏆'
          : isCheckedIn ? '🚩'
          : isPast ? '✓'
          : isCurrent ? '🔖'
          : String(i);

        const textStyle = isPast || isCurrent || isFirst || isLast || isCheckedIn
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

const DAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

function StreakTrack({ streak, checkinDays }) {
  const today = new Date().setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * 86400000);
  return (
    <View style={styles.streakCard}>
      <View style={styles.streakHeader}>
        <Text style={styles.streakTitle}>🔥 연속 독서</Text>
        <Text style={styles.streakCount}>{streak}일 연속</Text>
      </View>
      <View style={styles.streakDayRow}>
        {days.map((dayTs) => {
          const isToday = dayTs === today;
          const done = checkinDays.has(dayTs);
          return (
            <View key={dayTs} style={styles.streakDayCol}>
              <Text style={[styles.streakDayLabel, isToday && styles.streakDayLabelToday]}>
                {DAY_SHORT[new Date(dayTs).getDay()]}
              </Text>
              <View style={[
                styles.streakDayNode,
                done && styles.streakDayNodeDone,
                isToday && !done && styles.streakDayNodeToday,
              ]}>
                {done ? (
                  <Text style={styles.streakDayCheck}>✓</Text>
                ) : isToday ? (
                  <Text style={styles.streakDayToday}>·</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const NODES_PER_ROW = 10;

function DynamicSnakeTrack({ stepIdx, totalSteps, checkedInSteps }) {
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
    const isCheckedIn = !isFirst && !isLast && checkedInSteps?.has(ni);
    const extra = (isFirst || isLast) ? styles.nodeSpecial
      : isCheckedIn ? styles.nodeCheckedIn
      : isPast ? styles.nodePast
      : isCurrent ? styles.nodeCurrent
      : styles.nodeFuture;
    const content = isFirst ? '📖' : isLast ? '🏆'
      : isCheckedIn ? '🚩' : isPast ? '✓' : isCurrent ? '🔖' : '·';
    const textStyle = (isPast || isCurrent || isFirst || isLast || isCheckedIn)
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

async function checkBookInPhoto(base64) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return true;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `당신은 독서 인증 사진 검증 AI입니다. 아래 기준으로 이 사진이 실제 독서 인증 사진인지 판단하세요.

[인정 유형]
A) 종이책: 실제 종이책의 내부 페이지(인쇄된 텍스트, 여백, 페이지 질감)가 보이는 경우
B) 전자책: 스마트폰·태블릿·e-ink 리더·모니터 등의 화면에 전자책 앱(리디북스, 밀리의서재, Kindle, Books 등)이나 PDF 뷰어로 책 본문을 표시하고 있는 경우
C) 동화책·그림책: 그림과 짧은 텍스트가 혼합된 어린이 도서 내부 페이지가 보이는 경우 (텍스트가 적어도 인정)
D) 학습 만화책: 만화 컷·말풍선·그림으로 구성된 학습 만화 내부 페이지가 보이는 경우 (말풍선 텍스트 포함)

[판단 기준 — A·B·C·D 중 하나를 충족해야 함]
1. 본문 텍스트(활자) 또는 말풍선 텍스트, 그림책 문장이 존재하는가? (동화책·만화책은 소량이어도 인정)
2. 페이지 번호, 챕터 제목, 진행률 바 등 독서 맥락이 보이는가?
3. 책을 읽는 자연스러운 상황(손, 책상, 조명 등)인가?

[불인정 사례]
- 책 표지·상품 이미지만 보이는 경우
- 인터넷 브라우저, SNS, 쇼핑 앱 등 독서와 무관한 화면
- 책과 전혀 무관한 사진(풍경, 인물, 음식 등)
- 본문이 아닌 책 소개·리뷰 페이지만 촬영한 경우

기준 1을 충족하고, 기준 2·3 중 하나 이상이 충족되면 인정합니다. 동화책·학습 만화책은 텍스트 양이 적어도 책 내부 페이지임이 확인되면 인정합니다.

결과는 반드시 YES 또는 NO 한 단어만 답하세요.`,
              },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          }],
        }),
      }
    );
    const json = await resp.json();
    const answer = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return answer.trim().toUpperCase().startsWith('YES');
  } catch {
    return true;
  }
}

function ChallengeCard({ book, onPress, isSuccess, onCheckin }) {
  const [checkins, setCheckins] = useState(() => {
    try { return JSON.parse(book.checkins || '[]'); } catch { return []; }
  });
  const bonusPrefKey = `challenge_bonus_${book.id}_${todayKey()}`;
  const [bonusXp, setBonusXp] = useState(() => {
    const val = parseInt(getPref(bonusPrefKey) ?? '0', 10);
    return isNaN(val) ? 0 : val;
  });

  const perfectPrefKey = `challenge_perfect_${book.id}`;
  const [perfectBonus, setPerfectBonus] = useState(() => {
    const val = parseInt(getPref(perfectPrefKey) ?? '0', 10);
    return isNaN(val) ? 0 : val;
  });

  const startTs = book.startDate || book.createdAt;
  const startMidnight = startTs ? new Date(startTs).setHours(0, 0, 0, 0) : null;
  const goalMidnight = book.goalDate ? new Date(book.goalDate).setHours(0, 0, 0, 0) : null;

  const totalDays = (goalMidnight && startMidnight && goalMidnight > startMidnight)
    ? Math.max(Math.ceil((goalMidnight - startMidnight) / 86400000), 1)
    : null;
  const totalSteps = totalDays !== null ? totalDays : STEPS;
  const stepIdx = isSuccess ? totalSteps - 1 : calcStepIdx(book, totalSteps);
  const useSnake = totalDays !== null && totalDays >= 6;

  const todayTs = new Date().setHours(0, 0, 0, 0);
  const alreadyCheckedIn = checkins.includes(todayTs);

  const maxCheckinStep = useSnake ? totalSteps - 2 : STEPS - 2;
  const checkedInSteps = new Set(
    checkins.flatMap((ts) => {
      if (!startMidnight || !goalMidnight || goalMidnight <= startMidnight) return [];
      const ratio = Math.min(1, Math.max(0, (ts - startMidnight) / (goalMidnight - startMidnight)));
      const step = Math.round(ratio * (totalSteps - 1));
      const clamped = Math.min(Math.max(1, step), maxCheckinStep);
      return clamped >= 1 ? [clamped] : [];
    })
  );

  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [bookDetected, setBookDetected] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const openCamera = async () => {
    if (alreadyCheckedIn) return;
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setCameraOpen(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true, base64: true });
    setPhotoUri(photo.uri);
    setVerifying(true);
    setBookDetected(null);
    const detected = await checkBookInPhoto(photo.base64);
    setBookDetected(detected);
    setVerifying(false);
  };

  const confirmCheckin = () => {
    handleCheckin();
    setPhotoUri(null);
    setCameraOpen(false);
    setBookDetected(null);
  };

  const retake = () => {
    setPhotoUri(null);
    setBookDetected(null);
  };

  const handleCheckin = () => {
    if (alreadyCheckedIn) return;
    const newCheckins = [...checkins, todayTs];
    addCheckin(book.id, todayTs);
    setCheckins(newCheckins);
    onCheckin?.(todayTs);

    if (book.goalDate && !getPref(bonusPrefKey)) {
      const bonus = 5 + Math.floor(Math.random() * 6);
      addXp(bonus);
      setPref(bonusPrefKey, String(bonus));
      setBonusXp(bonus);
    }

    if (startMidnight && goalMidnight && todayTs >= goalMidnight && !getPref(perfectPrefKey)) {
      const totalDays = Math.round((goalMidnight - startMidnight) / 86400000) + 1;
      const checkinSet = new Set(newCheckins);
      const allCovered = Array.from({ length: totalDays }, (_, i) => startMidnight + i * 86400000)
        .every((d) => checkinSet.has(d));
      if (allCovered) {
        const PERFECT_BONUS = 100;
        addXp(PERFECT_BONUS);
        setPref(perfectPrefKey, String(PERFECT_BONUS));
        setPerfectBonus(PERFECT_BONUS);
      }
    }
  };

  const elapsedDays = (book.status === 'reading' && startMidnight)
    ? Math.max(0, Math.round((todayTs - startMidnight) / 86400000)) + 1
    : null;

  const completionDays = (isSuccess && book.endDate && startMidnight)
    ? Math.max(1, Math.round((new Date(book.endDate).setHours(0, 0, 0, 0) - startMidnight) / 86400000) + 1)
    : null;

  const startLabel = isSuccess
    ? (completionDays !== null ? `${completionDays}일 만에 완독` : fmtDate(startTs) ?? '?')
    : book.status === 'want_to_read'
    ? '시작 전'
    : elapsedDays !== null
    ? `${elapsedDays}일째 독서 중`
    : fmtDate(startTs) ?? '?';

  const goalLabel = isSuccess
    ? `완독일: ${fmtDate(book.endDate) ?? '?'}`
    : book.goalDate
    ? fmtDate(book.goalDate) + ' 목표'
    : '목표일 미설정 — 책 상세에서 설정';

  return (
    <>
    <TouchableOpacity style={[styles.card, isSuccess && styles.cardSuccess]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
          {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!isSuccess && book.status === 'reading' && (
            <TouchableOpacity
              style={[styles.checkinBtn, alreadyCheckedIn && styles.checkinBtnDone]}
              onPress={openCamera}
              disabled={alreadyCheckedIn}
            >
              <Text style={styles.checkinBtnText}>
                {alreadyCheckedIn ? '✓ 인증완료' : '📷 독서인증'}
              </Text>
            </TouchableOpacity>
          )}
          {isSuccess
            ? <View style={styles.successBadge}><Text style={styles.successBadgeText}>🎉 성공!</Text></View>
            : <DaysBadge goalTs={book.goalDate} />}
        </View>
      </View>

      {useSnake
        ? <DynamicSnakeTrack stepIdx={stepIdx} totalSteps={totalSteps} checkedInSteps={checkedInSteps} />
        : <BoardTrack stepIdx={stepIdx} checkedInSteps={checkedInSteps} />}

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>{startLabel}</Text>
        <Text style={styles.dateLabel} numberOfLines={1}>{goalLabel}</Text>
      </View>

      {alreadyCheckedIn && bonusXp > 0 && (
        <Text style={styles.bonusLabel}>🎯 오늘 챌린지 보너스 +{bonusXp} XP</Text>
      )}
      {perfectBonus > 0 && (
        <Text style={styles.perfectBonusLabel}>🌟 매일 인증 달성! 보너스 +{perfectBonus} XP</Text>
      )}
    </TouchableOpacity>

    <Modal
      visible={cameraOpen}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { setPhotoUri(null); setCameraOpen(false); }}
    >
      <View style={styles.cameraContainer}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
            {verifying ? (
              <View style={styles.previewOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.verifyingText}>책 인식 중...</Text>
              </View>
            ) : bookDetected === false ? (
              <View style={styles.previewOverlay}>
                <Text style={styles.noBookEmoji}>📵</Text>
                <Text style={styles.noBookText}>책이 감지되지 않았습니다</Text>
                <Text style={styles.noBookHint}>책이 잘 보이도록 다시 촬영해 주세요</Text>
                <TouchableOpacity style={[styles.retakeBtn, { width: '60%' }]} onPress={retake}>
                  <Text style={styles.retakeBtnText}>다시 찍기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.previewOverlay}>
                <Text style={styles.previewHint}>이 사진으로 독서 인증할까요?</Text>
                <View style={styles.previewButtons}>
                  <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
                    <Text style={styles.retakeBtnText}>다시 찍기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmCheckin}>
                    <Text style={styles.confirmBtnText}>인증하기 ✓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <View style={styles.cameraOverlay}>
              <Text style={styles.cameraHint}>📚 책과 함께 독서 중인 모습을 찍어주세요</Text>
              <View style={styles.cameraButtonRow}>
                <TouchableOpacity style={styles.cancelCameraBtn} onPress={() => setCameraOpen(false)}>
                  <Text style={styles.cancelCameraBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
                  <View style={styles.captureBtnInner} />
                </TouchableOpacity>
                <View style={{ width: 64 }} />
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
    </>
  );
}

export default function ChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState([]);
  const [successBooks, setSuccessBooks] = useState([]);
  const [streak, setStreak] = useState(0);
  const [checkinDays, setCheckinDays] = useState(new Set());

  const refreshStreak = useCallback(() => {
    setStreak(getReadStreak());
    setCheckinDays(getCheckinDays());
  }, []);

  const handleCheckinFromCard = useCallback((todayTs) => {
    setStreak(getReadStreak());
    setCheckinDays((prev) => new Set([...prev, todayTs]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setBooks([
        ...getBooksByStatus('reading').filter((b) => b.goalDate),
        ...getBooksByStatus('want_to_read').filter((b) => b.goalDate),
      ]);
      setSuccessBooks(getSuccessfulChallengeBooks());
      refreshStreak();
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>독서 챌린지</Text>
        <TouchableOpacity
          style={styles.endedBtn}
          onPress={() => router.push('/ended-challenges')}
          activeOpacity={0.75}
        >
          <Text style={styles.endedBtnText}>종료된 챌린지 목록</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.screenSub}>목표일을 향해 한 칸씩 나아가세요!</Text>

      <StreakTrack streak={streak} checkinDays={checkinDays} />

      {books.length === 0 && successBooks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📚</Text>
          <Text style={styles.emptyText}>읽는 중이거나 읽고 싶은 책이 없습니다</Text>
        </View>
      ) : (
        <>
          {books.map((book) => (
            <ChallengeCard
              key={book.id}
              book={book}
              onPress={() => router.push(`/book/${book.id}`)}
              onCheckin={handleCheckinFromCard}
            />
          ))}
          {successBooks.length > 0 && (
            <>
              <Text style={styles.successSectionTitle}>챌린지 성공 🎉</Text>
              {successBooks.map((book) => (
                <ChallengeCard
                  key={`success-${book.id}`}
                  book={book}
                  isSuccess
                  onPress={() => router.push(`/book/${book.id}`)}
                />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: '#1C1B1F' },
  endedBtn: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: PURPLE_LIGHT,
  },
  endedBtnText: { fontSize: 12, fontWeight: '600', color: PURPLE },
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
  nodeCheckedIn: { backgroundColor: '#4CAF50' },
  nodeFuture: { backgroundColor: PURPLE_LIGHT, borderWidth: 1.5, borderColor: PURPLE_MID },
  nodeTextLight: { fontSize: 13, color: '#fff', fontWeight: '600' },
  nodeTextDark: { fontSize: 11, color: '#9E8FB2' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dateLabel: { fontSize: 11, color: '#9E8FB2', flexShrink: 1 },

  checkinBtn: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: PURPLE,
  },
  checkinBtnDone: { backgroundColor: '#4CAF50' },
  checkinBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  bonusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6750A4',
    marginTop: 8,
    textAlign: 'right',
  },
  perfectBonusLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E65100',
    marginTop: 6,
    textAlign: 'right',
  },
  snakeTrack: { marginBottom: 12, flexDirection: 'column' },
  vertConnector: { width: 4, height: 20, borderRadius: 2 },

  streakCard: {
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
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  streakTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F' },
  streakCount: { fontSize: 14, fontWeight: '800', color: '#E65100' },
  streakDayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  streakDayCol: { alignItems: 'center', gap: 6, flex: 1 },
  streakDayLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },
  streakDayLabelToday: { color: PURPLE, fontWeight: '800' },
  streakDayNode: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F0EDF6',
    alignItems: 'center', justifyContent: 'center',
  },
  streakDayNodeDone: { backgroundColor: '#4CAF50' },
  streakDayNodeToday: { borderWidth: 2, borderColor: PURPLE },
  streakDayCheck: { fontSize: 14, color: '#fff', fontWeight: '700' },
  streakDayToday: { fontSize: 16, color: PURPLE, fontWeight: '900' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },

  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center', gap: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cameraHint: { fontSize: 15, color: '#fff', fontWeight: '600', textAlign: 'center' },
  cameraButtonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%',
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  captureBtnInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff',
  },
  cancelCameraBtn: {
    width: 64, alignItems: 'center', paddingVertical: 8,
  },
  cancelCameraBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  previewImage: { flex: 1, width: '100%' },
  previewOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center', gap: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  previewHint: { fontSize: 16, color: '#fff', fontWeight: '700', textAlign: 'center' },
  previewButtons: { flexDirection: 'row', gap: 16, width: '100%' },
  retakeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  retakeBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  confirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: PURPLE, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  verifyingText: { fontSize: 16, color: '#fff', fontWeight: '600', marginTop: 16, textAlign: 'center' },
  noBookEmoji: { fontSize: 48 },
  noBookText: { fontSize: 17, color: '#fff', fontWeight: '800', textAlign: 'center', marginTop: 8 },
  noBookHint: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 6, marginBottom: 16 },

  cardSuccess: { borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  successBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#E8F5E9',
  },
  successBadgeText: { fontSize: 12, fontWeight: '700', color: '#388E3C' },
  successSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#388E3C',
    marginBottom: 12,
    marginTop: 4,
  },
});
