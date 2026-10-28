"""Generator logo lemburin (v2: jam analog, logo dimiringkan -8 derajat).

Semua varian dibuat dari satu definisi:
  python3 buat-logo.py <folder-output>             -> pratinjau
  build_project('<client/public>')                  -> semua aset aplikasi
Butuh: pip install cairosvg pillow, dan font Plus Jakarta Sans terpasang.
"""
import math, os, sys
import cairosvg

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)

TEAL_HI, TEAL, NAVY, NAVY2 = '#2CC9A8', '#0B6E5E', '#262D63', '#12152B'
AMBER_HI, AMBER, AMBER_LO = '#FFE1A3', '#F7A93B', '#D9730D'
MIRING = -8          # derajat, sama dengan kemiringan ikon QR di desain awal


def defs(uid):
    return f'''<defs>
<linearGradient id="bg{uid}" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="{TEAL_HI}"/><stop offset=".42" stop-color="{TEAL}"/><stop offset="1" stop-color="{NAVY2}"/>
</linearGradient>
<linearGradient id="gloss{uid}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
</linearGradient>
<radialGradient id="face{uid}" cx=".34" cy=".3" r=".85">
  <stop offset="0" stop-color="{AMBER_HI}"/><stop offset=".5" stop-color="{AMBER}"/><stop offset="1" stop-color="{AMBER_LO}"/>
</radialGradient>
<linearGradient id="frame{uid}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDE3F2"/>
</linearGradient>
</defs>'''


def titik(cx, cy, r, jam):
    """Koordinat di lingkaran untuk posisi jam (0-12), 12 di atas."""
    a = math.radians(jam * 30 - 90)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def jam_analog(cx, cy, r, uid, mono=False, kecil=False):
    """Jam analog menunjuk pukul 5 tepat (17.00): jam kerja usai, lembur dimulai."""
    face = '#161A2E' if mono else f'url(#face{uid})'
    tangan = '#FFFFFF' if mono else NAVY2
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{face}"/>']
    if not mono:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.86:.1f}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="{r*0.04:.1f}"/>')
    if not kecil:
        for j in (12, 3, 6, 9):
            x1, y1 = titik(cx, cy, r * 0.62, j)
            x2, y2 = titik(cx, cy, r * 0.76, j)
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{tangan}" stroke-opacity=".55" stroke-width="{r*0.07:.1f}" stroke-linecap="round"/>')
    lebar = r * (0.17 if kecil else 0.12)
    hx, hy = titik(cx, cy, r * (0.42 if kecil else 0.40), 5)    # jarum jam -> 5
    mx, my = titik(cx, cy, r * (0.62 if kecil else 0.58), 12)   # jarum menit -> 12
    out.append(f'<line x1="{cx}" y1="{cy}" x2="{mx:.1f}" y2="{my:.1f}" stroke="{tangan}" stroke-width="{lebar*0.8:.1f}" stroke-linecap="round"/>')
    out.append(f'<line x1="{cx}" y1="{cy}" x2="{hx:.1f}" y2="{hy:.1f}" stroke="{tangan}" stroke-width="{lebar:.1f}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{lebar*0.75:.1f}" fill="{tangan}"/>')
    return ''.join(out)


def mark(variant='full', uid='a'):
    """Isi logo di kanvas 512. variant: full | small (favicon) | mono"""
    mono = variant == 'mono'
    white = '#FFFFFF' if not mono else '#161A2E'
    framefill = f'url(#frame{uid})' if not mono else '#161A2E'
    if variant == 'small':
        # Favicon: bingkai + jam saja, lebih tebal dan besar
        fx, fs, sw, rx = 60, 392, 72, 100
        return (f'<rect x="{fx}" y="{fx}" width="{fs}" height="{fs}" rx="{rx}" fill="none" stroke="{framefill}" stroke-width="{sw}"/>'
                + jam_analog(256, 256, 116, uid, kecil=True))
    fx, fs, sw, rx = 92, 260, 38, 64           # bingkai finder QR (kiri-atas)
    c = fx + fs / 2                               # pusat bingkai = 222
    mods = ''.join(
        f'<rect x="{x}" y="{y}" width="46" height="46" rx="13" fill="{white}" opacity="{o}"/>'
        for x, y, o in [(378, 378, 1), (378, 296, .55), (296, 378, .55)])
    shadow = '' if mono else f'<rect x="{fx}" y="{fx + 10}" width="{fs}" height="{fs}" rx="{rx}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="{sw}"/>'
    return (shadow +
            f'<rect x="{fx}" y="{fx}" width="{fs}" height="{fs}" rx="{rx}" fill="none" stroke="{framefill}" stroke-width="{sw}"/>'
            + jam_analog(c, c, 76, uid, mono=mono) + mods)


def tile(variant='full', uid='a', maskable=False, miring_isi=False):
    """Ikon persegi. miring_isi=True: kotak tetap tegak, isinya miring (untuk ikon HP & favicon)."""
    rx = 0 if maskable else 116
    body = mark(variant, uid)
    if miring_isi:
        body = f'<g transform="rotate({MIRING} 256 256)">{body}</g>'
    if maskable:  # zona aman maskable = lingkaran 80%: perkecil isi
        body = f'<g transform="translate(256 256) scale(.74) translate(-256 -256)">{body}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{defs(uid)}'
            f'<rect width="512" height="512" rx="{rx}" fill="url(#bg{uid})"/>'
            f'<rect width="512" height="512" rx="{rx}" fill="url(#gloss{uid})"/>'
            f'{body}</svg>')


def isi(svg):
    return svg.split('>', 1)[1].rsplit('</svg>', 1)[0]


def logo_miring(uid='t'):
    """Logo utama: seluruh ikon dimiringkan -8 derajat, diberi ruang supaya sudut tidak terpotong."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 592 592">'
            f'<g transform="rotate({MIRING} 256 256)">{isi(tile("full", uid))}</g></svg>')


def mono():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 592 592">{defs("m")}'
            f'<g transform="rotate({MIRING} 256 256)">{mark("mono", "m")}</g></svg>')


def _font():
    from PIL import ImageFont
    return ImageFont.truetype(os.path.expanduser('~/.fonts/PlusJakartaSans-800.ttf'), 1000)


NAMA = ('lembur', 'in')   # wordmark "lemburin": "in" berwarna teal, satu kata tanpa spasi


def wordmark(cx, base, fs, warna="#FFFFFF", aksen=TEAL_HI):
    """Wordmark 'lemburin' di tengah (lebar diukur dari font asli)."""
    f = _font()
    ls = -fs * 0.02
    w1 = f.getlength(NAMA[0]) / 1000 * fs + ls * len(NAMA[0])
    w2 = f.getlength(NAMA[1]) / 1000 * fs + ls * len(NAMA[1])
    x0 = cx - (w1 + w2) / 2
    return (f'<text x="{x0:.1f}" y="{base:.1f}" font-family="Plus Jakarta Sans" font-weight="800" font-size="{fs:.1f}" fill="{warna}" letter-spacing="{ls:.2f}">{NAMA[0]}</text>'
            f'<text x="{x0 + w1:.1f}" y="{base:.1f}" font-family="Plus Jakarta Sans" font-weight="800" font-size="{fs:.1f}" fill="{aksen}" letter-spacing="{ls:.2f}">{NAMA[1]}</text>')


def wordmark_left(x0, base, fs, warna, aksen=TEAL):
    ls = -fs * 0.02
    w1 = _font().getlength(NAMA[0]) / 1000 * fs + ls * len(NAMA[0])
    return (f'<text x="{x0}" y="{base}" font-family="Plus Jakarta Sans" font-weight="800" font-size="{fs}" fill="{warna}" letter-spacing="{ls:.2f}">{NAMA[0]}</text>'
            f'<text x="{x0 + w1:.1f}" y="{base}" font-family="Plus Jakarta Sans" font-weight="800" font-size="{fs}" fill="{aksen}" letter-spacing="{ls:.2f}">{NAMA[1]}</text>')


def splash(w, h):
    """Splash screen: latar navy malam, logo miring di tengah, wordmark & tagline."""
    s = min(w, h) * 0.30
    x, y = (w - s) / 2, h * 0.40 - s / 2
    fs = s * 0.30
    k = s / 512
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs><radialGradient id="sky" cx=".5" cy=".38" r=".75">
<stop offset="0" stop-color="#2E3672"/><stop offset=".55" stop-color="{NAVY2}"/><stop offset="1" stop-color="#0A0C1A"/></radialGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="{TEAL_HI}" stop-opacity=".35"/><stop offset="1" stop-color="{TEAL_HI}" stop-opacity="0"/></radialGradient></defs>
<rect width="{w}" height="{h}" fill="url(#sky)"/>
<circle cx="{w/2}" cy="{y + s/2}" r="{s*1.1}" fill="url(#glow)"/>
<ellipse cx="{w/2}" cy="{y + s*1.12}" rx="{s*.42}" ry="{s*.05}" fill="#000" opacity=".45"/>
<g transform="translate({x} {y}) scale({k}) rotate({MIRING} 256 256)">{isi(tile('full', 's'))}</g>
{wordmark(w/2, y + s + fs*2.0, fs)}
<text x="{w/2}" y="{y + s + fs*2.0 + fs*0.95}" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="600" font-size="{fs*0.42}" fill="#C5CAE6">Satu tap, lembur tercatat</text>
</svg>'''


def lockup(dark=False):
    """Logo horizontal: ikon miring + wordmark + tagline."""
    W, H = 1240, 400
    ink = '#FFFFFF' if dark else '#161A2E'
    sub = '#C5CAE6' if dark else '#4F5670'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
            f'<g transform="translate(30 44) scale({300/512}) rotate({MIRING} 256 256)">{isi(tile("full", "l" + ("d" if dark else "")))}</g>'
            + wordmark_left(380, 228, 150, ink, TEAL_HI if dark else TEAL) +
            f'<text x="384" y="300" font-family="Plus Jakarta Sans" font-weight="600" font-size="46" fill="{sub}">Satu tap, lembur tercatat</text></svg>')


def square_full():
    """Ikon persegi penuh untuk iPhone (iOS membulatkan sudut sendiri)."""
    return tile('full', 'q', miring_isi=True).replace('rx="116"', 'rx="0"')


def save(name, svg, size=None, w=None, h=None):
    with open(f'{OUT}/{name}.svg', 'w') as f:
        f.write(svg)
    if size or w:
        cairosvg.svg2png(bytestring=svg.encode(), write_to=f'{OUT}/{name}.png',
                         output_width=w or size, output_height=h or size)


def build_project(dst):
    from PIL import Image
    os.makedirs(f'{dst}/splash', exist_ok=True)
    small = tile('small', 'f', miring_isi=True)
    app = tile('full', 'g', miring_isi=True)
    open(f'{dst}/icon.svg', 'w').write(small)            # favicon tab browser
    open(f'{dst}/logo.svg', 'w').write(logo_miring('h'))  # logo di dalam aplikasi
    open(f'{dst}/logo-mono.svg', 'w').write(mono())
    for s, name, svg in [(192, 'pwa-192.png', app), (512, 'pwa-512.png', app),
                         (512, 'pwa-512-maskable.png', tile('full', 'k', maskable=True, miring_isi=True)),
                         (180, 'apple-touch-icon.png', square_full())]:
        cairosvg.svg2png(bytestring=svg.encode(), write_to=f'{dst}/{name}', output_width=s, output_height=s)
    big = f'{dst}/_fav.png'
    cairosvg.svg2png(bytestring=small.encode(), write_to=big, output_width=256, output_height=256)
    Image.open(big).save(f'{dst}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    os.remove(big)
    for w, h in [(1290, 2796), (1179, 2556), (1170, 2532), (1284, 2778), (1125, 2436), (828, 1792), (750, 1334)]:
        p = f'{dst}/splash/splash-{w}x{h}.png'
        cairosvg.svg2png(bytestring=splash(w, h).encode(), write_to=p)
        Image.open(p).convert('RGB').save(p, optimize=True)


def build_brand(dst):
    """File logo mentah untuk folder brand/."""
    os.makedirs(dst, exist_ok=True)
    files = {
        'logo-miring.svg': logo_miring('b'),
        'ikon-aplikasi.svg': tile('full', 'a', miring_isi=True),
        'favicon.svg': tile('small', 'f', miring_isi=True),
        'logo-satu-warna.svg': mono(),
        'logo-horizontal-terang.svg': lockup(False),
        'logo-horizontal-gelap.svg': lockup(True),
    }
    for n, svg in files.items():
        open(f'{dst}/{n}', 'w').write(svg)
    cairosvg.svg2png(bytestring=files['logo-miring.svg'].encode(), write_to=f'{dst}/logo-miring-1024.png', output_width=1024, output_height=1024)
    cairosvg.svg2png(bytestring=files['ikon-aplikasi.svg'].encode(), write_to=f'{dst}/ikon-aplikasi-1024.png', output_width=1024, output_height=1024)
    for n in ('logo-horizontal-terang', 'logo-horizontal-gelap'):
        cairosvg.svg2png(bytestring=files[f'{n}.svg'].encode(), write_to=f'{dst}/{n}.png', output_width=1240)


if __name__ == '__main__':
    save('logo-miring', logo_miring(), 1024)
    save('icon-app', tile('full', miring_isi=True), 512)
    save('icon-small', tile('small', miring_isi=True), 512)
    save('icon-maskable', tile('full', maskable=True, miring_isi=True), 512)
    save('logo-mono', mono(), 512)
    save('lockup-light', lockup(False), w=1240, h=400)
    save('lockup-dark', lockup(True), w=1240, h=400)
    save('splash-preview', splash(1170, 2532), w=780, h=1688)
    for s in (16, 32, 48):
        cairosvg.svg2png(bytestring=tile('small', miring_isi=True).encode(), write_to=f'{OUT}/fav-{s}.png', output_width=s, output_height=s)
    print('ok')
