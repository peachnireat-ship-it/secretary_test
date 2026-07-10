import os
import tempfile
import subprocess
import threading
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


HF_TOKEN = os.environ.get('HF_TOKEN')
API_KEY = os.environ.get('PYANNOTE_API_KEY')
_pipeline = None

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


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from pyannote.audio import Pipeline
        if not HF_TOKEN:
            raise RuntimeError('HF_TOKEN 환경변수가 설정되지 않았습니다.')
        _pipeline = Pipeline.from_pretrained(
            'pyannote/speaker-diarization-3.1',
            use_auth_token=HF_TOKEN,
        )
    return _pipeline


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
                diarization = get_pipeline()(output_path)
            except Exception as e:
                return jsonify({'error': f'화자 분리 오류: {str(e)}'}), 500

            segments = [
                {
                    'speaker': speaker,
                    'start': round(turn.start, 3),
                    'end': round(turn.end, 3),
                }
                for turn, _, speaker in diarization.itertracks(yield_label=True)
            ]

        return jsonify({'segments': segments})
    finally:
        _busy_lock.release()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
