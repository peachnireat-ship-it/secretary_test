import os
import tarfile
import tempfile
import subprocess
import threading
import urllib.request
from datetime import date
from flask import Flask, request, jsonify, Response

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 업로드 파일 50MB 제한


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response


API_KEY = os.environ.get('PYANNOTE_API_KEY')
print(f'[startup] PYANNOTE_API_KEY set: {bool(API_KEY)} (len={len(API_KEY) if API_KEY else 0})')
_diarizer = None

# sherpa-onnx 기반 화자 분리 모델 (ONNX Runtime, PyTorch 불필요 — 512MB 무료 티어 대응).
# pyannote.audio 3.1(PyTorch)이 세그멘테이션+임베딩 모델을 전부 메모리에 올리면서
# 512MB를 초과해 OOM이 반복되어, 같은 세그멘테이션 모델(pyannote/segmentation-3.0)을
# ONNX로 변환한 버전 + 경량 임베딩 모델(CAM++) 조합으로 교체.
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_models')
SEGMENTATION_DIR = os.path.join(MODELS_DIR, 'sherpa-onnx-pyannote-segmentation-3-0')
SEGMENTATION_MODEL = os.path.join(SEGMENTATION_DIR, 'model.onnx')
EMBEDDING_MODEL = os.path.join(MODELS_DIR, 'campplus_sv_en_voxceleb_16k.onnx')
SEGMENTATION_URL = (
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/'
    'speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2'
)
EMBEDDING_URL = (
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/'
    'speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx'
)

# 무료 티어(단일 워커) 보호용: 동시 처리 1건 제한
_busy_lock = threading.Lock()

# 무료 티어 남용 방지용: 사용자별 일일 화자 분리 요청 수 제한 (재배포/슬립 시 초기화됨)
MAX_DAILY_DIARIZE = 20
MAX_AUDIO_DURATION_SEC = 600  # 10분
_daily_counts = {}
_daily_lock = threading.Lock()


def check_api_key():
    if not API_KEY:
        return None
    if request.headers.get('X-API-Key') != API_KEY:
        return jsonify({'error': '인증 실패'}), 401
    return None


def check_and_bump_quota():
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'X-User-Id 헤더가 필요합니다.'}), 400

    today = date.today().isoformat()
    with _daily_lock:
        entry = _daily_counts.get(user_id)
        if not entry or entry['date'] != today:
            entry = {'date': today, 'count': 0}
        if entry['count'] >= MAX_DAILY_DIARIZE:
            return jsonify({'error': f'일일 화자 분리 요청 한도({MAX_DAILY_DIARIZE}회)를 초과했습니다.'}), 429
        entry['count'] += 1
        _daily_counts[user_id] = entry
    return None


def get_audio_duration(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=noprint_wrappers=1:nokey=1', path],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _ensure_models_downloaded():
    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(SEGMENTATION_MODEL):
        archive_path = os.path.join(MODELS_DIR, 'segmentation.tar.bz2')
        urllib.request.urlretrieve(SEGMENTATION_URL, archive_path)
        with tarfile.open(archive_path, 'r:bz2') as tar:
            tar.extractall(MODELS_DIR)
        os.remove(archive_path)
    if not os.path.exists(EMBEDDING_MODEL):
        urllib.request.urlretrieve(EMBEDDING_URL, EMBEDDING_MODEL)


def get_diarizer():
    global _diarizer
    if _diarizer is None:
        _ensure_models_downloaded()
        import sherpa_onnx
        config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                    model=SEGMENTATION_MODEL
                ),
            ),
            embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
                model=EMBEDDING_MODEL
            ),
            # 참석자 수를 모르므로 -1(자동 검출)로 클러스터링. threshold는 라이브러리 기본값.
            clustering=sherpa_onnx.FastClusteringConfig(
                num_clusters=-1,
                threshold=0.5,
            ),
            min_duration_on=0.3,
            min_duration_off=0.5,
        )
        if not config.validate():
            raise RuntimeError('sherpa-onnx 화자 분리 설정이 유효하지 않습니다(모델 파일 확인 필요).')
        _diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    return _diarizer


def preprocess_audio(input_path, output_path):
    subprocess.run(
        [
            'ffmpeg', '-y', '-i', input_path,
            '-ac', '1',
            '-ar', '16000',
            '-af', 'highpass=f=100,lowpass=f=8000',
            output_path,
        ],
        check=True,
        capture_output=True,
    )


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/mono', methods=['POST'])
def mono():
    err = check_api_key()
    if err:
        return err

    if 'file' not in request.files:
        return jsonify({'error': 'file 필드가 없습니다.'}), 400

    if not _busy_lock.acquire(blocking=False):
        return jsonify({'error': '다른 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.'}), 429

    try:
        file = request.files['file']
        ext = os.path.splitext(file.filename)[1] or '.m4a'

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, f'input{ext}')
            output_path = os.path.join(tmpdir, 'output.wav')

            file.save(input_path)
            try:
                preprocess_audio(input_path, output_path)
            except subprocess.CalledProcessError as e:
                return jsonify({'error': f'FFmpeg 오류: {e.stderr.decode(errors="replace")}'}), 500

            with open(output_path, 'rb') as f:
                wav_bytes = f.read()

        return Response(wav_bytes, mimetype='audio/wav')
    finally:
        _busy_lock.release()


@app.route('/diarize', methods=['POST'])
def diarize():
    err = check_api_key()
    if err:
        return err

    if 'file' not in request.files:
        return jsonify({'error': 'file 필드가 없습니다.'}), 400

    err = check_and_bump_quota()
    if err:
        return err

    if not _busy_lock.acquire(blocking=False):
        return jsonify({'error': '다른 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.'}), 429

    try:
        file = request.files['file']
        ext = os.path.splitext(file.filename)[1] or '.m4a'

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, f'input{ext}')
            output_path = os.path.join(tmpdir, 'output.wav')

            file.save(input_path)
            try:
                preprocess_audio(input_path, output_path)
            except subprocess.CalledProcessError as e:
                return jsonify({'error': f'FFmpeg 오류: {e.stderr.decode(errors="replace")}'}), 500

            if get_audio_duration(output_path) > MAX_AUDIO_DURATION_SEC:
                return jsonify({'error': f'오디오 길이가 {MAX_AUDIO_DURATION_SEC // 60}분을 초과합니다.'}), 400

            try:
                import soundfile as sf
                data, sample_rate = sf.read(output_path, dtype='float32', always_2d=True)
                audio = data[:, 0]
                diarizer = get_diarizer()
                if sample_rate != diarizer.sample_rate:
                    return jsonify({
                        'error': f'샘플레이트 불일치: 모델 기대값 {diarizer.sample_rate}Hz, 실제 {sample_rate}Hz',
                    }), 500
                result = diarizer.process(audio).sort_by_start_time()
            except Exception as e:
                return jsonify({'error': f'화자 분리 오류: {str(e)}'}), 500

            segments = [
                {
                    'speaker': f'SPEAKER_{r.speaker:02d}',
                    'start': round(r.start, 3),
                    'end': round(r.end, 3),
                }
                for r in result
            ]

        return jsonify({'segments': segments})
    finally:
        _busy_lock.release()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
