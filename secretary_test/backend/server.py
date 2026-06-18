import os
import subprocess
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="pyannote diarization server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HF_TOKEN = os.environ.get("HF_TOKEN", "")
_pipeline = None


def load_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN 환경변수가 설정되지 않았습니다. "
            "HuggingFace 토큰을 환경변수로 전달하세요."
        )
    from pyannote.audio import Pipeline
    import torch

    _pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=HF_TOKEN,
    )
    if torch.cuda.is_available():
        _pipeline = _pipeline.to(torch.device("cuda"))
    return _pipeline


def convert_to_wav(src: str) -> str:
    """ffmpeg으로 16kHz mono WAV 변환 (pyannote 최적 입력 포맷)"""
    dst = src + ".wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", src,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            dst,
        ],
        check=True,
        capture_output=True,
    )
    return dst


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/diarize")
async def diarize(file: UploadFile = File(...)):
    filename = file.filename or "audio.m4a"
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "m4a"

    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(await file.read())
        src_path = tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav(src_path)
        pipe = load_pipeline()
        diarization = pipe(wav_path)
        segments = [
            {
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
                "speaker": speaker,
            }
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]
        return {"segments": segments}

    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"ffmpeg 변환 실패: {e.stderr.decode(errors='replace')}")
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    finally:
        if os.path.exists(src_path):
            os.unlink(src_path)
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)
