#!/usr/bin/env python3
"""Find the transparent cut-outs in a room frame (RGBA png) and print their corners on the 1920x1080 stage,
plus the true width/height ratio of each (perspective undone, rectangle assumed, principal point at the centre).
python3 tools/cutouts.py assets/images/bridge.png"""
import sys, json, numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image
def aspect(q, u0=960, v0=540):
    """Whiteley-Zhang: width/height of a rectangle seen as quad q = TL, TR, BR, BL."""
    m = [np.array([x - u0, y - v0, 1.0]) for x, y in (q[0], q[1], q[3], q[2])]   # m1 TL, m2 TR, m3 BL, m4 BR
    k2 = np.dot(np.cross(m[0], m[3]), m[2]) / np.dot(np.cross(m[1], m[3]), m[2])
    k3 = np.dot(np.cross(m[0], m[3]), m[1]) / np.dot(np.cross(m[2], m[3]), m[1])
    n2, n3 = k2 * m[1] - m[0], k3 * m[2] - m[0]
    den = n2[2] * n3[2]
    if abs(den) < 1e-9: return None
    f2 = -((n2[0] * n3[0] + n2[1] * n3[1]) / den)
    if f2 <= 0: return None
    A = np.diag([1 / np.sqrt(f2), 1 / np.sqrt(f2), 1.0])
    r2 = np.dot(A @ n2, A @ n2) / np.dot(A @ n3, A @ n3)
    return float(np.sqrt(r2)) if r2 > 0 else None
def main(path, min_px=900):
    im = Image.open(path).convert('RGBA'); W, H = im.size; sx, sy = 1920 / W, 1080 / H
    mask = np.array(im)[..., 3] < 128
    lab, k = ndi.label(mask); out = []
    for i in range(1, k + 1):
        m = (lab == i).astype(np.uint8)
        if m.sum() < min_px: continue
        c = max(cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
        hull = cv2.convexHull(c); peri = cv2.arcLength(hull, True)
        quad = None
        for e in np.linspace(0.01, 0.1, 30):
            ap = cv2.approxPolyDP(hull, e * peri, True)
            if len(ap) == 4: quad = ap[:, 0, :].astype(float); break
        x, y, w, h = cv2.boundingRect(c)
        entry = {'id': len(out) + 1, 'area': int(m.sum() * sx * sy), 'bbox': [round(x * sx), round(y * sy), round(w * sx), round(h * sy)]}
        if quad is not None:
            s = quad.sum(1); d = np.diff(quad, axis=1)[:, 0]
            tl, br, tr, bl = quad[np.argmin(s)], quad[np.argmax(s)], quad[np.argmin(d)], quad[np.argmax(d)]
            q = [[round(p[0] * sx), round(p[1] * sy)] for p in (tl, tr, br, bl)]
            entry['quad'] = q; entry['aspect'] = aspect(q)
        out.append(entry)
    return out
if __name__ == '__main__':
    for e in main(sys.argv[1]): print(json.dumps(e))
