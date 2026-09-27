"""Track object anchors through the reconstruction half of scene-01.mp4 with pyramidal Lucas-Kanade.

Each object is marked once (reference frame, box, label anchor at the top of the box, all normalized to the
1080 x 1440 reconstruction half below the label bar). Features inside the box are tracked forwards and
backwards; the anchor moves by their median displacement; features are re-seeded around the moving box;
the object is dropped once its box leaves the frame. Output: preview/v2/data/scene-01-tracks.json. Needs opencv-python-headless and numpy.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VIDEO = str(ROOT / "assets/studio/videos/scene-01.mp4")
OUT = ROOT / "preview/v2/data/scene-01-tracks.json"
S = .5                     # work at half resolution
W, H = int(1080 * S), int(1440 * S)
STEP = 2                   # keep every 2nd frame (30 samples per second)

# id, record entity node, reference frame, box (x0, y0, x1, y1), anchor (x, y)
OBJECTS = [
    ("microwave", "Entity__s1-microwave-003", 0, (.31, .26, .57, .39), (.44, .26)),
    ("stool_left", "Entity__s1-stool-left", 0, (.19, .51, .53, .61), (.36, .51)),
    ("stool_right", "Entity__s1-stool-right", 0, (.55, .52, .90, .62), (.73, .52)),
    ("wall_power", "Entity__s1-wall-power-accessories", 0, (.44, .20, .54, .25), (.49, .21)),
    ("hanging_cabinet", "Entity__s1-hanging-cabinet-measured", 0, (.30, .00, .98, .10), (.62, .03)),
    ("floor_cabinet", "Entity__s1-floor-cabinet-measured", 359, (.15, .25, .60, .52), (.40, .27)),
    ("coffee_machine", "Entity__s1-coffee-machine", 359, (.71, .29, .95, .53), (.83, .30)),
]


def load_frames():
    cap = cv2.VideoCapture(VIDEO)
    frames = []
    while True:
        ok, img = cap.read()
        if not ok:
            break
        half = img[32:, 1080:]
        frames.append(cv2.cvtColor(cv2.resize(half, (W, H)), cv2.COLOR_BGR2GRAY))
    return frames


def seed(gray, box):
    x0, y0, x1, y1 = [int(round(v)) for v in (box[0] * W, box[1] * H, box[2] * W, box[3] * H)]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return np.empty((0, 1, 2), np.float32)
    mask = np.zeros_like(gray)
    mask[y0:y1, x0:x1] = 255
    pts = cv2.goodFeaturesToTrack(gray, 60, .01, 4, mask=mask)
    return pts if pts is not None else np.empty((0, 1, 2), np.float32)


def run(frames, ref, box, anchor, direction):
    lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, .01))
    box, anchor = np.array(box, float), np.array(anchor, float)
    pts = seed(frames[ref], box)
    out = {ref: anchor.tolist()}
    f = ref
    while 0 <= f + direction < len(frames):
        g0, g1 = frames[f], frames[f + direction]
        if len(pts) < 4:
            break
        nxt, st, _ = cv2.calcOpticalFlowPyrLK(g0, g1, pts, None, **lk)
        back, st2, _ = cv2.calcOpticalFlowPyrLK(g1, g0, nxt, None, **lk)
        fb = np.linalg.norm((back - pts).reshape(-1, 2), axis=1)
        good = (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 1.0)
        if good.sum() < 4:
            break
        d = np.median((nxt - pts).reshape(-1, 2)[good], axis=0) / [W, H]
        anchor += d
        box += [d[0], d[1], d[0], d[1]]
        f += direction
        pts = nxt[good].reshape(-1, 1, 2)
        if len(pts) < 20:  # re-seed inside the moving box
            more = seed(frames[f], box)
            pts = np.concatenate([pts, more]) if len(more) else pts
        centre = (box[0] + box[2]) / 2
        if not (-.02 <= centre <= 1.02) or box[3] < 0 or box[1] > 1:
            break
        out[f] = anchor.tolist()
    return out


def main():
    frames = load_frames()
    print(f"{len(frames)} frames")
    tracks = []
    for oid, node, ref, box, anchor in OBJECTS:
        pos = {**run(frames, ref, box, anchor, -1), **run(frames, ref, box, anchor, +1)}
        series = [([round(pos[i][0], 3), round(pos[i][1], 3)] if i in pos else None) for i in range(0, len(frames), STEP)]
        seen = [i for i in range(len(frames)) if i in pos]
        print(f"{oid:16s} frames {min(seen)}..{max(seen)} ({len(seen)} tracked)")
        tracks.append({"id": oid, "entity": node, "anchor": series})
    OUT.write_text(json.dumps({"fps": 60, "step": STEP, "frames": len(frames), "space": "reconstruction half, normalized", "objects": tracks}, separators=(",", ":")))
    print(f"-> {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
