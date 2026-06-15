"""
반려동물 애니메이션 MP4 클립 생성 스크립트
대상: cat, dog, rabbit, hamster, hedgehog, fish (6종)
출력: assets/pet-videos/{pettype}_{mode}.mp4
"""

import math
import os
import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'pet-videos')
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 304, 304
FPS = 24
BG = (255, 255, 255, 0)


def ellipse(draw, cx, cy, rx, ry, fill):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def make_frame(draw_fn, params):
    img = Image.new('RGBA', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_fn(draw, W // 2, H // 2 + 20, **params)
    return np.array(img.convert('RGB'))


def build_clip(name, frames_params, draw_fn, fps=FPS):
    path = os.path.join(OUT_DIR, f'{name}.mp4')
    frames = [make_frame(draw_fn, p) for p in frames_params]
    iio.imwrite(path, frames, fps=fps, codec='libx264',
                output_params=['-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'fast'])
    print(f'  saved → {path}  ({len(frames)} frames)')


# ══════════════════════════════════════════════════════════════════
#  CAT  고양이  (주황 태비)
# ══════════════════════════════════════════════════════════════════
C_BODY    = (225, 165, 100)
C_SHADOW  = (178, 125, 75)
C_EAR     = (255, 175, 185)
C_EYE     = (45, 170, 75)
C_PUPIL   = (25, 25, 25)
C_NOSE    = (220, 100, 125)
C_WHISKER = (200, 185, 160)
C_BELLY   = (248, 215, 170)
C_STRIPE  = (195, 140, 75)


def draw_cat(draw, cx, cy,
             leg_phase=0.0, eye_blink=False, tail_angle=30.0,
             body_bob=0.0, eating=False):
    cy = int(cy + body_bob)
    lp = leg_phase * 2 * math.pi
    ta = math.radians(tail_angle)

    # 꼬리 (뒤에서 위로 구부러짐)
    for i in range(7):
        t = i / 6
        tx = cx + 36 - int(18 * t * math.cos(ta))
        ty = cy + 10 - int(32 * t * math.sin(ta * 0.6 + 0.5))
        r = max(3, 10 - i)
        draw.ellipse([tx - r, ty - r, tx + r, ty + r], fill=C_BODY)

    # 다리
    for i, ox in enumerate([-18, -6, 6, 18]):
        phase = lp + i * math.pi / 2
        dy = int(7 * math.sin(phase))
        draw.ellipse([cx + ox - 6, cy + 28 + dy - 5,
                      cx + ox + 6, cy + 28 + dy + 5], fill=C_SHADOW)

    # 몸통
    draw.ellipse([cx - 38, cy - 20, cx + 38, cy + 32], fill=C_BODY)
    # 줄무늬 3개
    for sx in [-14, 0, 14]:
        draw.line([(cx + sx, cy - 18), (cx + sx, cy + 10)], fill=C_STRIPE, width=2)
    # 배
    draw.ellipse([cx - 20, cy - 2, cx + 20, cy + 28], fill=C_BELLY)

    # 머리
    draw.ellipse([cx - 26, cy - 54, cx + 26, cy - 8], fill=C_BODY)

    # 귀 (삼각형)
    draw.polygon([(cx - 26, cy - 44), (cx - 16, cy - 72), (cx - 6, cy - 44)], fill=C_BODY)
    draw.polygon([(cx - 23, cy - 47), (cx - 16, cy - 67), (cx - 9, cy - 47)], fill=C_EAR)
    draw.polygon([(cx + 6,  cy - 44), (cx + 16, cy - 72), (cx + 26, cy - 44)], fill=C_BODY)
    draw.polygon([(cx + 9,  cy - 47), (cx + 16, cy - 67), (cx + 23, cy - 47)], fill=C_EAR)

    # 눈
    ey = cy - 36
    if eye_blink:
        draw.line([(cx - 15, ey), (cx - 5, ey)], fill=C_PUPIL, width=2)
        draw.line([(cx + 5,  ey), (cx + 15, ey)], fill=C_PUPIL, width=2)
    else:
        for ex in (-10, 10):
            ellipse(draw, cx + ex, ey, 7, 5, C_EYE)
            ellipse(draw, cx + ex, ey, 4, 5, C_PUPIL)
            draw.ellipse([cx + ex - 2, ey - 3, cx + ex, ey - 1], fill=(255, 255, 255))

    # 코
    draw.polygon([(cx, cy - 22), (cx - 4, cy - 17), (cx + 4, cy - 17)], fill=C_NOSE)
    draw.line([(cx, cy - 17), (cx - 5, cy - 12)], fill=C_NOSE, width=2)
    draw.line([(cx, cy - 17), (cx + 5, cy - 12)], fill=C_NOSE, width=2)

    # 수염
    for side in (-1, 1):
        for i in range(3):
            wx2 = cx + side * 32
            wy1 = cy - 20 + i * 4 - 4
            draw.line([(cx + side * 7, wy1), (wx2, wy1 + side * (i - 1) * 3)],
                      fill=C_WHISKER, width=1)

    if eating:
        ellipse(draw, cx - 4, cy - 8, 7, 5, (80, 180, 80))


def clips_cat():
    print('고양이...')
    n = 30
    build_clip('cat_walk', [dict(leg_phase=i/n,
               body_bob=math.sin(i/n*4*math.pi)*3,
               tail_angle=30+math.sin(i/n*2*math.pi)*20) for i in range(n)], draw_cat)

    n = 48
    build_clip('cat_idle', [dict(leg_phase=0, body_bob=math.sin(i/n*2*math.pi)*2,
               tail_angle=25+math.sin(i/n*2*math.pi)*15,
               eye_blink=(0.83 < i/n < 0.90)) for i in range(n)], draw_cat)

    n = 36
    build_clip('cat_eat', [dict(leg_phase=0,
               body_bob=-2+abs(math.sin(i/n*3*math.pi))*5,
               tail_angle=20, eating=True) for i in range(n)], draw_cat)

    n = 48
    build_clip('cat_sleep', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1.5,
               tail_angle=10, eye_blink=True) for i in range(n)], draw_cat)


# ══════════════════════════════════════════════════════════════════
#  DOG  강아지  (골든 리트리버 느낌)
# ══════════════════════════════════════════════════════════════════
D_BODY   = (200, 155, 90)
D_SHADOW = (160, 115, 65)
D_EAR    = (175, 125, 65)
D_EYE    = (60, 40, 20)
D_NOSE   = (40, 35, 40)
D_TONGUE = (230, 100, 110)
D_BELLY  = (230, 195, 145)


def draw_dog(draw, cx, cy,
             leg_phase=0.0, eye_blink=False, tail_angle=60.0,
             body_bob=0.0, eating=False, tongue=False):
    cy = int(cy + body_bob)
    lp = leg_phase * 2 * math.pi
    ta = math.radians(tail_angle)

    # 꼬리 (위로 올라가는 형태)
    for i in range(6):
        t = i / 5
        tx = cx + 38 - int(20 * t * math.cos(ta))
        ty = cy + 5 - int(35 * t * math.sin(ta * 0.7))
        r = max(4, 10 - i)
        draw.ellipse([tx - r, ty - r, tx + r, ty + r], fill=D_BODY)

    # 다리 (두꺼운 강아지 다리)
    for i, ox in enumerate([-20, -7, 7, 20]):
        phase = lp + i * math.pi / 2
        dy = int(7 * math.sin(phase))
        draw.ellipse([cx + ox - 9, cy + 26 + dy - 6,
                      cx + ox + 9, cy + 26 + dy + 6], fill=D_SHADOW)
        # 발
        draw.ellipse([cx + ox - 8, cy + 30 + dy - 3,
                      cx + ox + 8, cy + 30 + dy + 3], fill=D_SHADOW)

    # 몸통
    draw.ellipse([cx - 40, cy - 18, cx + 40, cy + 32], fill=D_BODY)
    draw.ellipse([cx - 22, cy - 2, cx + 22, cy + 28], fill=D_BELLY)

    # 목
    draw.ellipse([cx - 16, cy - 50, cx + 16, cy - 18], fill=D_BODY)

    # 머리 (둥글고 큼)
    draw.ellipse([cx - 30, cy - 58, cx + 30, cy - 8], fill=D_BODY)

    # 귀 (늘어진 귀)
    draw.ellipse([cx - 42, cy - 50, cx - 18, cy - 18], fill=D_EAR)
    draw.ellipse([cx + 18,  cy - 50, cx + 42, cy - 18], fill=D_EAR)

    # 주둥이
    draw.ellipse([cx - 18, cy - 32, cx + 18, cy - 12], fill=D_BELLY)

    # 코
    ellipse(draw, cx, cy - 28, 9, 6, D_NOSE)
    # 콧구멍
    ellipse(draw, cx - 4, cy - 29, 2, 2, (20, 15, 20))
    ellipse(draw, cx + 4, cy - 29, 2, 2, (20, 15, 20))

    # 눈
    ey = cy - 42
    if eye_blink:
        draw.line([(cx - 16, ey), (cx - 6, ey)], fill=D_EYE, width=3)
        draw.line([(cx + 6,  ey), (cx + 16, ey)], fill=D_EYE, width=3)
    else:
        for ex in (-11, 11):
            ellipse(draw, cx + ex, ey, 7, 7, D_EYE)
            draw.ellipse([cx + ex - 2, ey - 3, cx + ex, ey - 1], fill=(255, 255, 255))

    # 혀 (먹거나 혀 내밀 때)
    if tongue or eating:
        draw.ellipse([cx - 6, cy - 18, cx + 6, cy - 6], fill=D_TONGUE)

    if eating:
        ellipse(draw, cx, cy - 8, 10, 6, (160, 110, 60))


def clips_dog():
    print('강아지...')
    n = 30
    build_clip('dog_walk', [dict(leg_phase=i/n,
               body_bob=math.sin(i/n*4*math.pi)*3,
               tail_angle=55+math.sin(i/n*4*math.pi)*25,
               tongue=(i % 10 > 7)) for i in range(n)], draw_dog)

    n = 48
    build_clip('dog_idle', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*2,
               tail_angle=60+math.sin(i/n*3*math.pi)*20,
               eye_blink=(0.85 < i/n < 0.91),
               tongue=(i/n > 0.6)) for i in range(n)], draw_dog)

    n = 36
    build_clip('dog_eat', [dict(leg_phase=0,
               body_bob=-2+abs(math.sin(i/n*3*math.pi))*6,
               tail_angle=80, eating=True) for i in range(n)], draw_dog)

    n = 48
    build_clip('dog_sleep', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1.5,
               tail_angle=20, eye_blink=True) for i in range(n)], draw_dog)


# ══════════════════════════════════════════════════════════════════
#  RABBIT  토끼  (흰 토끼)
# ══════════════════════════════════════════════════════════════════
R_BODY    = (235, 230, 235)
R_SHADOW  = (190, 180, 195)
R_EAR_IN  = (255, 180, 190)
R_EYE     = (230, 80, 100)
R_NOSE    = (230, 100, 120)
R_TAIL    = (245, 243, 248)


def draw_rabbit(draw, cx, cy,
                leg_phase=0.0, eye_blink=False, ear_droop=0.0,
                body_bob=0.0, eating=False):
    cy = int(cy + body_bob)
    lp = leg_phase * 2 * math.pi

    # 꼬리 (작은 솜방울)
    ellipse(draw, cx + 36, cy + 12, 10, 10, R_TAIL)

    # 다리
    for i, ox in enumerate([-18, -6, 6, 18]):
        phase = lp + i * math.pi / 2
        dy = int(8 * math.sin(phase))
        draw.ellipse([cx + ox - 7, cy + 28 + dy - 5,
                      cx + ox + 7, cy + 28 + dy + 5], fill=R_SHADOW)

    # 몸통 (둥글고 통통)
    draw.ellipse([cx - 36, cy - 20, cx + 36, cy + 34], fill=R_BODY)
    draw.ellipse([cx - 18, cy, cx + 18, cy + 30], fill=(248, 244, 250))

    # 머리 (둥글)
    draw.ellipse([cx - 24, cy - 54, cx + 24, cy - 10], fill=R_BODY)

    # 귀 (긴 귀 — 약간 드룹)
    droop = int(ear_droop * 20)
    # 왼쪽 귀
    draw.ellipse([cx - 22, cy - 100 + droop, cx - 6, cy - 48], fill=R_BODY)
    draw.ellipse([cx - 19, cy - 96 + droop, cx - 9, cy - 52], fill=R_EAR_IN)
    # 오른쪽 귀
    draw.ellipse([cx + 6,  cy - 100 + droop, cx + 22, cy - 48], fill=R_BODY)
    draw.ellipse([cx + 9,  cy - 96 + droop, cx + 19, cy - 52], fill=R_EAR_IN)

    # 눈
    ey = cy - 36
    if eye_blink:
        draw.arc([cx - 18, ey - 4, cx - 6, ey + 4], 0, 180, fill=R_EYE, width=2)
        draw.arc([cx + 6,  ey - 4, cx + 18, ey + 4], 0, 180, fill=R_EYE, width=2)
    else:
        ellipse(draw, cx - 12, ey, 6, 6, R_EYE)
        ellipse(draw, cx + 12, ey, 6, 6, R_EYE)
        draw.ellipse([cx - 14, ey - 3, cx - 12, ey - 1], fill=(255, 255, 255))
        draw.ellipse([cx + 10, ey - 3, cx + 12, ey - 1], fill=(255, 255, 255))

    # 코 (Y자 토끼 코)
    ellipse(draw, cx, cy - 22, 5, 4, R_NOSE)
    draw.line([(cx, cy - 18), (cx - 5, cy - 13)], fill=R_NOSE, width=2)
    draw.line([(cx, cy - 18), (cx + 5, cy - 13)], fill=R_NOSE, width=2)

    # 수염 (짧게)
    for side in (-1, 1):
        for i in range(2):
            wy = cy - 20 + i * 5
            draw.line([(cx + side * 6, wy), (cx + side * 22, wy + side * (i - 0.5) * 3)],
                      fill=R_SHADOW, width=1)

    if eating:
        draw.ellipse([cx - 10, cy - 16, cx + 10, cy - 6], fill=(100, 200, 80))


def clips_rabbit():
    print('토끼...')
    n = 24
    build_clip('rabbit_walk', [dict(leg_phase=i/n,
               body_bob=abs(math.sin(i/n*4*math.pi))*-4,
               ear_droop=0.2+abs(math.sin(i/n*4*math.pi))*0.3) for i in range(n)], draw_rabbit)

    n = 48
    build_clip('rabbit_idle', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*2,
               ear_droop=0.1+math.sin(i/n*2*math.pi)*0.05,
               eye_blink=(0.83 < i/n < 0.90)) for i in range(n)], draw_rabbit)

    n = 36
    build_clip('rabbit_eat', [dict(leg_phase=0,
               body_bob=abs(math.sin(i/n*4*math.pi))*4,
               ear_droop=0.3, eating=True) for i in range(n)], draw_rabbit)

    n = 48
    build_clip('rabbit_sleep', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1,
               ear_droop=0.8, eye_blink=True) for i in range(n)], draw_rabbit)


# ══════════════════════════════════════════════════════════════════
#  HAMSTER  햄스터  (골든 햄스터)
# ══════════════════════════════════════════════════════════════════
H_BODY   = (220, 170, 100)
H_SHADOW = (180, 130, 70)
H_CHEEK  = (240, 200, 160)
H_EYE    = (30, 25, 30)
H_NOSE   = (210, 110, 120)
H_EAR    = (230, 175, 185)
H_BELLY  = (245, 220, 185)


def draw_hamster(draw, cx, cy,
                 leg_phase=0.0, eye_blink=False, cheek_puff=1.0,
                 body_bob=0.0, eating=False):
    cy = int(cy + body_bob)
    lp = leg_phase * 2 * math.pi

    # 짧은 꼬리
    draw.ellipse([cx + 26, cy + 10, cx + 36, cy + 20], fill=H_SHADOW)

    # 다리 (아주 짧고 통통)
    for i, ox in enumerate([-12, -4, 4, 12]):
        phase = lp + i * math.pi / 2
        dy = int(4 * math.sin(phase))
        draw.ellipse([cx + ox - 7, cy + 28 + dy - 4,
                      cx + ox + 7, cy + 28 + dy + 4], fill=H_SHADOW)

    # 몸통 (매우 둥글고 통통)
    draw.ellipse([cx - 32, cy - 18, cx + 32, cy + 34], fill=H_BODY)
    draw.ellipse([cx - 18, cy - 2, cx + 18, cy + 28], fill=H_BELLY)

    # 머리 (몸통과 거의 같은 크기)
    draw.ellipse([cx - 26, cy - 50, cx + 26, cy - 6], fill=H_BODY)

    # 볼 주머니 (불룩)
    puff = int(cheek_puff * 8)
    draw.ellipse([cx - 38, cy - 36, cx - 14, cy - 14 + puff], fill=H_CHEEK)
    draw.ellipse([cx + 14,  cy - 36, cx + 38, cy - 14 + puff], fill=H_CHEEK)

    # 귀 (작고 둥근)
    ellipse(draw, cx - 18, cy - 50, 10, 10, H_BODY)
    ellipse(draw, cx - 18, cy - 50, 6, 6, H_EAR)
    ellipse(draw, cx + 18, cy - 50, 10, 10, H_BODY)
    ellipse(draw, cx + 18, cy - 50, 6, 6, H_EAR)

    # 눈 (작고 반짝)
    ey = cy - 32
    if eye_blink:
        draw.line([(cx - 12, ey), (cx - 4, ey)], fill=H_EYE, width=2)
        draw.line([(cx + 4,  ey), (cx + 12, ey)], fill=H_EYE, width=2)
    else:
        ellipse(draw, cx - 8,  ey, 5, 5, H_EYE)
        ellipse(draw, cx + 8, ey, 5, 5, H_EYE)
        draw.ellipse([cx - 10, ey - 3, cx - 8, ey - 1], fill=(255, 255, 255))
        draw.ellipse([cx + 6,  ey - 3, cx + 8,  ey - 1], fill=(255, 255, 255))

    # 코
    ellipse(draw, cx, cy - 20, 4, 3, H_NOSE)

    # 이빨 (먹을 때)
    if eating:
        draw.rectangle([cx - 5, cy - 16, cx - 1, cy - 10], fill=(245, 242, 230))
        draw.rectangle([cx + 1, cy - 16, cx + 5, cy - 10], fill=(245, 242, 230))
        ellipse(draw, cx, cy - 8, 12, 6, (180, 140, 80))  # 먹이


def clips_hamster():
    print('햄스터...')
    n = 24
    build_clip('hamster_walk', [dict(leg_phase=i/n,
               body_bob=abs(math.sin(i/n*6*math.pi))*-3,
               cheek_puff=0.6) for i in range(n)], draw_hamster)

    n = 48
    build_clip('hamster_idle', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1.5,
               cheek_puff=0.8+math.sin(i/n*4*math.pi)*0.2,
               eye_blink=(0.85 < i/n < 0.92)) for i in range(n)], draw_hamster)

    n = 36
    build_clip('hamster_eat', [dict(leg_phase=0,
               body_bob=abs(math.sin(i/n*4*math.pi))*4,
               cheek_puff=1.0, eating=True) for i in range(n)], draw_hamster)

    n = 48
    build_clip('hamster_sleep', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1,
               cheek_puff=1.0, eye_blink=True) for i in range(n)], draw_hamster)


# ══════════════════════════════════════════════════════════════════
#  HEDGEHOG  고슴도치
# ══════════════════════════════════════════════════════════════════
HH_SPINE  = (80, 65, 50)
HH_BODY   = (180, 155, 110)
HH_BELLY  = (230, 210, 180)
HH_SNOUT  = (220, 185, 155)
HH_EYE    = (35, 28, 35)
HH_NOSE   = (50, 40, 45)


def draw_hedgehog(draw, cx, cy,
                  leg_phase=0.0, eye_blink=False, spine_raise=0.0,
                  body_bob=0.0, eating=False):
    cy = int(cy + body_bob)
    lp = leg_phase * 2 * math.pi

    # 가시 (등 위쪽 반원에 그리기)
    spine_y_off = -int(spine_raise * 5)
    for angle in range(-70, 100, 14):
        rad = math.radians(angle)
        bx = cx + int(32 * math.cos(rad))
        by = cy - 10 + spine_y_off + int(20 * math.sin(rad))
        tip_x = cx + int(52 * math.cos(rad))
        tip_y = cy - 10 + spine_y_off + int(34 * math.sin(rad))
        if by < cy - 5:  # 등 위에만 그리기
            draw.line([(bx, by), (tip_x, tip_y)], fill=HH_SPINE, width=2)

    # 다리 (아주 짧음)
    for i, ox in enumerate([-12, -4, 4, 12]):
        phase = lp + i * math.pi / 2
        dy = int(4 * math.sin(phase))
        draw.ellipse([cx + ox - 6, cy + 26 + dy - 4,
                      cx + ox + 6, cy + 26 + dy + 4], fill=HH_BODY)

    # 몸통 (등은 가시로 덮임, 배만 둥글게)
    draw.ellipse([cx - 34, cy - 10, cx + 34, cy + 30], fill=HH_BODY)
    draw.ellipse([cx - 20, cy - 2, cx + 20, cy + 26], fill=HH_BELLY)

    # 머리 (뾰족한 주둥이)
    draw.ellipse([cx - 22, cy - 44, cx + 22, cy - 4], fill=HH_BODY)
    # 주둥이
    draw.ellipse([cx - 14, cy - 30, cx + 20, cy - 10], fill=HH_SNOUT)

    # 귀 (작은 둥근 귀)
    ellipse(draw, cx - 16, cy - 44, 8, 8, HH_BODY)
    ellipse(draw, cx + 16, cy - 44, 8, 8, HH_BODY)

    # 눈
    ey = cy - 32
    if eye_blink:
        draw.line([(cx - 12, ey), (cx - 4, ey)], fill=HH_EYE, width=2)
    else:
        ellipse(draw, cx - 8, ey, 5, 5, HH_EYE)
        draw.ellipse([cx - 10, ey - 3, cx - 8, ey - 1], fill=(255, 255, 255))

    # 코
    ellipse(draw, cx + 8, cy - 20, 5, 4, HH_NOSE)

    if eating:
        draw.ellipse([cx - 2, cy - 14, cx + 16, cy - 6], fill=(90, 160, 80))


def clips_hedgehog():
    print('고슴도치...')
    n = 30
    build_clip('hedgehog_walk', [dict(leg_phase=i/n,
               body_bob=math.sin(i/n*4*math.pi)*2.5,
               spine_raise=0.3) for i in range(n)], draw_hedgehog)

    n = 48
    build_clip('hedgehog_idle', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1.5,
               spine_raise=abs(math.sin(i/n*3*math.pi))*0.4,
               eye_blink=(0.85 < i/n < 0.91)) for i in range(n)], draw_hedgehog)

    n = 36
    build_clip('hedgehog_eat', [dict(leg_phase=0,
               body_bob=abs(math.sin(i/n*3*math.pi))*4,
               spine_raise=0.0, eating=True) for i in range(n)], draw_hedgehog)

    n = 48
    build_clip('hedgehog_sleep', [dict(leg_phase=0,
               body_bob=math.sin(i/n*2*math.pi)*1,
               spine_raise=0.0, eye_blink=True) for i in range(n)], draw_hedgehog)


# ══════════════════════════════════════════════════════════════════
#  FISH  물고기  (금붕어)
# ══════════════════════════════════════════════════════════════════
F_BODY   = (235, 110, 55)
F_SHADOW = (195, 75, 30)
F_FIN    = (245, 145, 70)
F_BELLY  = (255, 215, 160)
F_EYE    = (35, 28, 35)
F_BUBBLE = (160, 215, 240)


def draw_fish(draw, cx, cy,
              swim_phase=0.0, eye_open=True, fin_angle=0.0,
              body_bob=0.0, eating=False):
    cy = int(cy + body_bob)
    sp = swim_phase * 2 * math.pi

    # 몸통 구부러짐 (수영 동작)
    tail_dx = int(math.sin(sp) * 14)

    # 꼬리 지느러미
    tx = cx + 40 + tail_dx
    ty = cy
    draw.polygon([(tx, ty), (tx + 22, ty - 18), (tx + 22, ty + 18)], fill=F_FIN)
    draw.polygon([(tx, ty), (tx + 18, ty - 12), (tx + 18, ty + 12)], fill=F_SHADOW)

    # 몸통 (약간 기울여 수영 느낌)
    body_angle = int(math.sin(sp) * 6)
    draw.ellipse([cx - 40, cy - 20 + body_angle,
                  cx + 42 + tail_dx // 2, cy + 20 - body_angle], fill=F_BODY)

    # 배 하이라이트
    draw.ellipse([cx - 28, cy - 8 + body_angle // 2,
                  cx + 28, cy + 14 - body_angle // 2], fill=F_BELLY)

    # 등 지느러미
    fa = math.radians(fin_angle)
    draw.polygon([
        (cx - 5, cy - 22),
        (cx + 10, cy - 22),
        (cx + 5 + int(8 * math.sin(fa)), cy - 42 + int(4 * math.cos(fa))),
    ], fill=F_FIN)

    # 가슴 지느러미
    draw.polygon([
        (cx - 10, cy - 5),
        (cx - 10, cy + 8),
        (cx - 28, cy + int(math.sin(sp) * 6)),
    ], fill=F_FIN)

    # 눈
    ey = cy - 6
    ellipse(draw, cx - 18, ey, 9, 9, (255, 255, 255))
    if eye_open:
        ellipse(draw, cx - 18, ey, 6, 6, F_EYE)
        draw.ellipse([cx - 21, ey - 3, cx - 19, ey - 1], fill=(255, 255, 255))
    else:
        draw.line([(cx - 24, ey), (cx - 12, ey)], fill=F_EYE, width=2)

    # 비늘 (간단한 선)
    for sx in [0, 12, 24]:
        draw.arc([cx - 35 + sx, cy - 14, cx - 15 + sx, cy + 10],
                 180, 360, fill=F_SHADOW, width=1)

    # 입
    if eating:
        draw.ellipse([cx - 46, cy - 4, cx - 38, cy + 4], fill=(60, 40, 30))
        ellipse(draw, cx - 55, cy - 5, 4, 4, (100, 190, 230))  # 먹이

    # 방울 (수면에 있을 때)
    if eating:
        for i, (bx, by) in enumerate([(-10, -30), (5, -45), (-20, -55)]):
            r = 4 - i
            draw.ellipse([cx + bx - r, cy + by - r, cx + bx + r, cy + by + r],
                         outline=F_BUBBLE, width=1)


def clips_fish():
    print('물고기...')
    n = 30
    build_clip('fish_walk', [dict(swim_phase=i/n, fin_angle=math.sin(i/n*4*math.pi)*20,
               body_bob=math.sin(i/n*2*math.pi)*4) for i in range(n)], draw_fish)

    n = 48
    build_clip('fish_idle', [dict(swim_phase=i/n*0.3, fin_angle=math.sin(i/n*2*math.pi)*10,
               body_bob=math.sin(i/n*2*math.pi)*3,
               eye_open=(i % 20 < 17)) for i in range(n)], draw_fish)

    n = 36
    build_clip('fish_eat', [dict(swim_phase=i/n*0.2,
               fin_angle=math.sin(i/n*6*math.pi)*15,
               body_bob=-abs(math.sin(i/n*3*math.pi))*8, eating=True) for i in range(n)], draw_fish)

    n = 48
    build_clip('fish_sleep', [dict(swim_phase=i/n*0.05, fin_angle=0,
               body_bob=math.sin(i/n*2*math.pi)*1.5,
               eye_open=False) for i in range(n)], draw_fish)


# ══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print('펫 클립 생성 중...')
    clips_cat()
    clips_dog()
    clips_rabbit()
    clips_hamster()
    clips_hedgehog()
    clips_fish()
    print('완료!')
