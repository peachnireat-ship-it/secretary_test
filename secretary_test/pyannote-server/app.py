import os
import tempfile
import subprocess
from flask import Flask, request, jsonify, Response
from pyannote.audio import Pipeline

app = Flask(__name__)

HF_TOKEN = os.environ.get('HF_TOKEN')
_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
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


@app.route('/mono', methods=['POST'])
def mono():
    if 'file' not in request.files:
        return jsonify({'error': 'file 필드가 없습니다.'}), 400

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


@app.route('/diarize', methods=['POST'])
def diarize():
    if 'file' not in request.files:
        return jsonify({'error': 'file 필드가 없습니다.'}), 400

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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
