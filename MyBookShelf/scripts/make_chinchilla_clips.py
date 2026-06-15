"""
친칠라 애니메이션 MP4 클립 생성 스크립트
출력: assets/pet-videos/chinchilla_{walk,idle,eat,sleep}.mp4
"""

import math
import os
import sys

import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'pet-videos')
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 304, 304   # 16의 배수 — ffmpeg macro_block 경고 방지
FPS = 24
BG = (255, 255, 255, 0)   # 투명 배경

# ── 색상 팔레트 ─────────────────────────────────────────────
BODY   = (210, 205, 225)
SHADOW = (160, 150, 175)
EAR    = (230, 180, 190)
EYE    = (40,  30,  50)
NOSE   = (220, 130, 150)
WHISKER= (180, 170, 200)
TEETH  = (245, 245, 230)
TAIL   = (190, 185, 210)
FOOD   = (200, 160,  80)


def ellipse(draw, cx, cy, rx, ry, fill, outline=None, lw=0):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                 fill=fill, outline=outline, width=lw)


def draw_chinchilla(draw, cx, cy,
                    leg_phase=0.0,     # 다리 흔들림 [0,1)
                    eye_blink=False,   # 눈 깜빡임
                    nose_twitch=0.0,   # 코 씰룩 [-1,1]
                    tail_angle=0.0,    # 꼬리 각도 (도)
                    body_bob=0.0,      # 몸통 상하 오프셋 (px)
                    eating=False,      # 먹이 먹는 중
                    ):
    cy = cy + body_bob

    # 꼬리
    ta = math.radians(tail_angle)
    tx = cx + 38 * math.cos(ta)
    ty = cy + 10 + 38 * math.sin(ta)
    draw.ellipse([tx - 18, ty - 12, tx + 18, ty + 12], fill=TAIL)

    # 다리 4개
    lp = leg_phase * 2 * math.pi
    offsets = [(-18, 0), (-6, 0), (6, 0), (18, 0)]
    for i, (ox, _) in enumerate(offsets):
        phase = lp + i * math.pi / 2
        dy_leg = int(6 * math.sin(phase))
        lx = cx + ox
        ly = cy + 28 + dy_leg
        draw.ellipse([lx - 7, ly - 5, lx + 7, ly + 5], fill=SHADOW)

    # 몸통
    draw.ellipse([cx - 40, cy - 22, cx + 40, cy + 32], fill=BODY)
    # 배 하이라이트
    draw.ellipse([cx - 22, cy - 5, cx + 22, cy + 28], fill=(228, 224, 238))

    # 머리
    draw.ellipse([cx - 26, cy - 52, cx + 26, cy - 6], fill=BODY)

    # 귀 (두 개)
    for ex in (-14, 14):
        draw.ellipse([cx + ex - 10, cy - 74, cx + ex + 10, cy - 46], fill=BODY)
        draw.ellipse([cx + ex - 6,  cy - 70, cx + ex + 6,  cy - 50], fill=EAR)

    # 눈
    ey = cy - 36
    if eye_blink:
        draw.line([(cx - 14, ey), (cx - 6, ey)], fill=EYE, width=2)
        draw.line([(cx + 6,  ey), (cx + 14, ey)], fill=EYE, width=2)
    else:
        for ex in (-10, 10):
            ellipse(draw, cx + ex, ey, 5, 5, EYE)
            ellipse(draw, cx + ex - 1, ey - 1, 2, 2, (255, 255, 255))

    # 코
    nt = int(nose_twitch * 2)
    ellipse(draw, cx, cy - 22 + nt, 5, 4, NOSE)

    # 수염
    for side in (-1, 1):
        for i in range(3):
            wx1 = cx + side * 8
            wy1 = cy - 22 + i * 4 - 4
            wx2 = cx + side * 30
            wy2 = wy1 + side * (i - 1) * 3
            draw.line([(wx1, wy1), (wx2, wy2)], fill=WHISKER, width=1)

    # 이빨 (먹는 중에만)
    if eating:
        draw.rectangle([cx - 5, cy - 16, cx + 5, cy - 10], fill=TEETH)

    # 먹이 (eating)
    if eating:
        draw.ellipse([cx - 14, cy - 12, cx + 14, cy + 2], fill=FOOD)
        draw.ellipse([cx - 10, cy - 14, cx + 10, cy - 2], fill=(220, 180, 100))


def make_frame(params: dict) -> np.ndarray:
    img = Image.new('RGBA', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_chinchilla(draw, W // 2, H // 2 + 20, **params)
    return np.array(img.convert('RGB'))


def build_clip(name: str, frame_params_list: list[dict], fps: int = FPS):
    path = os.path.join(OUT_DIR, f'chinchilla_{name}.mp4')
    frames = [make_frame(p) for p in frame_params_list]
    iio.imwrite(path, frames, fps=fps, codec='libx264',
                output_params=['-pix_fmt', 'yuv420p', '-crf', '28',
                               '-preset', 'fast'])
    print(f'  saved → {path}  ({len(frames)} frames)')


# ── WALK: 30프레임 루프 ──────────────────────────────────────
def clip_walk():
    n = 30
    frames = []
    for i in range(n):
        t = i / n
        frames.append(dict(
            leg_phase=t,
            body_bob=math.sin(t * 4 * math.pi) * 3,
            tail_angle=-20 + math.sin(t * 2 * math.pi) * 15,
            nose_twitch=math.sin(t * 6 * math.pi) * 0.5,
        ))
    build_clip('walk', frames)


# ── IDLE: 48프레임 루프 ──────────────────────────────────────
def clip_idle():
    n = 48
    frames = []
    for i in range(n):
        t = i / n
        blink = (0.85 < t < 0.92)
        frames.append(dict(
            leg_phase=0,
            body_bob=math.sin(t * 2 * math.pi) * 2,
            tail_angle=-10 + math.sin(t * 2 * math.pi) * 8,
            nose_twitch=math.sin(t * 8 * math.pi) * 0.8,
            eye_blink=blink,
        ))
    build_clip('idle', frames)


# ── EAT: 36프레임 루프 ───────────────────────────────────────
def clip_eat():
    n = 36
    frames = []
    for i in range(n):
        t = i / n
        bite = abs(math.sin(t * 3 * math.pi))
        frames.append(dict(
            leg_phase=0,
            body_bob=-2 + bite * 4,
            tail_angle=-5,
            nose_twitch=bite * 0.6,
            eating=True,
        ))
    build_clip('eat', frames)


# ── SLEEP: 48프레임 루프 ─────────────────────────────────────
def clip_sleep():
    n = 48
    frames = []
    for i in range(n):
        t = i / n
        frames.append(dict(
            leg_phase=0,
            body_bob=math.sin(t * 2 * math.pi) * 1.5,
            tail_angle=-30 + math.sin(t * 2 * math.pi) * 5,
            nose_twitch=0,
            eye_blink=True,
        ))
    build_clip('sleep', frames)


if __name__ == '__main__':
    print('친칠라 클립 생성 중...')
    clip_walk()
    clip_idle()
    clip_eat()
    clip_sleep()
    print('완료!')
