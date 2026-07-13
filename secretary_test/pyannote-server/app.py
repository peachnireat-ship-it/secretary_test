import os

# torch/MKL 스레드풀 크기를 제한해 Render 무료 티어(512MB) 메모리 오버헤드를 줄인다.
# torch가 실제로 import되기 전(지연 로딩 지점보다 먼저)에 설정되어야 효과가 있다.
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')

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
print(f'[startup] PYANNOTE_API_KEY set: {bool(API_KEY)} (len={len(API_KEY) if API_KEY else 0})')
print(f'[startup] HF_TOKEN set: {bool(HF_TOKEN)} (len={len(HF_TOKEN) if HF_TOKEN else 0})')
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
        import torch
        import torchaudio
        if not hasattr(torchaudio, 'list_audio_backends'):
            torchaudio.list_audio_backends = lambda: ['soundfile']
        if not hasattr(torchaudio, 'AudioMetaData'):
            class _AudioMetaDataStub:
                pass
            torchaudio.AudioMetaData = _AudioMetaDataStub
        from pyannote.audio import Pipeline
        # huggingface_hub의 hf_hub_download()가 use_auth_token 파라미터를 제거하고
        # token으로 이름을 바꾼 버전이 설치된 경우를 대비한 호환성 shim.
        # pyannote.audio 내부에서 `from huggingface_hub import hf_hub_download`로
        # 자기 네임스페이스에 참조를 복사해가는 모듈이 core/pipeline.py 외에도
        # core/model.py(세그멘테이션/임베딩 등 하위 모델 체크포인트 다운로드)와
        # pipelines/speaker_verification.py(화자 임베딩 모델 다운로드)에 각각 있어,
        # speaker-diarization-3.1 파이프라인이 하위 모델을 로딩하는 단계에서
        # pipeline.py만 패치하면 같은 에러가 재발한다. 3개 모듈 전부를 패치해야 한다.
        import inspect
        import pyannote.audio.core.pipeline as _pyannote_pipeline_module
        import pyannote.audio.core.model as _pyannote_model_module
        import pyannote.audio.pipelines.speaker_verification as _pyannote_speaker_verification_module

        def _patch_hf_hub_download_compat(module):
            if 'use_auth_token' not in inspect.signature(module.hf_hub_download).parameters:
                _orig = module.hf_hub_download

                def _compat(*args, use_auth_token=None, **kwargs):
                    if use_auth_token is not None:
                        kwargs.setdefault('token', use_auth_token)
                    return _orig(*args, **kwargs)

                module.hf_hub_download = _compat

        for _module in (
            _pyannote_pipeline_module,
            _pyannote_model_module,
            _pyannote_speaker_verification_module,
        ):
            _patch_hf_hub_download_compat(_module)
        if not HF_TOKEN:
            raise RuntimeError('HF_TOKEN 환경변수가 설정되지 않았습니다.')
        # 무료 티어 단일 워커 환경에서 torch의 스레드풀이 CPU 코어 수만큼 늘어나며
        # 메모리를 과도하게 쓰는 것을 막는다.
        torch.set_num_threads(1)
        # PyTorch 2.6부터 torch.load()의 weights_only 기본값이 True로 바뀌면서,
        # 2.6 이전에 저장된 pyannote 공식 체크포인트(torch.torch_version.TorchVersion 등
        # 안전 언피클링 화이트리스트에 없는 객체 포함)를 로드할 수 없게 됨.
        # HuggingFace의 공식 게이트 모델(HF_TOKEN 인증 필요)만 이 경로로 로딩되므로
        # 이 프로세스 내에서 weights_only=False로 완화하는 것은 허용 가능한 트레이드오프.
        if not getattr(torch.load, '_weights_only_compat_patched', False):
            _orig_torch_load = torch.load

            def _torch_load_compat(*args, **kwargs):
                # lightning의 _load()가 weights_only=None을 명시적으로 넘기는 경우가 있어
                # setdefault로는 걸러지지 않는다. None도 "미지정"으로 간주해 False로 보정한다.
                if kwargs.get('weights_only') is None:
                    kwargs['weights_only'] = False
                return _orig_torch_load(*args, **kwargs)

            _torch_load_compat._weights_only_compat_patched = True
            torch.load = _torch_load_compat
        _pipeline = Pipeline.from_pretrained(
            'pyannote/speaker-diarization-3.1',
            use_auth_token=HF_TOKEN,
        )
    return _pipeline


def load_waveform(path):
    # torchcodec(FFmpeg 공유 라이브러리 의존)을 우회하기 위해 soundfile로 직접 디코딩 후
    # {"waveform": Tensor, "sample_rate": int} 형태로 파이프라인에 전달한다.
    import soundfile as sf
    import torch
    data, sample_rate = sf.read(path, dtype='float32', always_2d=True)
    waveform = torch.from_numpy(data.T)
    return {'waveform': waveform, 'sample_rate': sample_rate}


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
                import torch
                # autograd 그래프 추적을 끄고 추론만 수행해 메모리 사용을 줄인다.
                # (Render 무료 티어 512MB에서 OOM으로 프로세스가 재시작되던 문제 대응)
                with torch.inference_mode():
                    diarization = get_pipeline()(load_waveform(output_path))
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
