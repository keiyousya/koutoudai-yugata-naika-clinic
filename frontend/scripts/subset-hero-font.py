#!/usr/bin/env python3
"""
Instagram広告デザインのhero（採用ページ・トップの募集欄・インフル予防接種ページ）で使う
M PLUS Rounded 1c を、heroに出てくる文字だけにサブセット化して src/fonts/ に書き出す。

heroの文言を変えたら再実行する（足りない文字は別フォントで表示されてしまう）。

  python3 scripts/subset-hero-font.py <TTFを置いたディレクトリ>

TTF（OFL）: https://github.com/google/fonts/tree/main/ofl/mplusrounded1c
必要: fonttools, brotli（pyftsubset）
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/fonts"

# (ファイル, 抜き出す範囲の開始, 終了)。終了が None ならファイル末尾まで
SOURCES = [
    ("src/components/RecruitVisual.astro", "---\n\n", "<style>"),
    ("src/pages/flu-vaccine.astro", '<section class="flu-hero">', "</section>"),
]

WEIGHTS = {"Bold": 700, "ExtraBold": 800, "Black": 900}


def hero_text() -> str:
    chars = set("0123456789")
    for rel, start, end in SOURCES:
        src = (ROOT / rel).read_text()
        i = src.index(start)
        j = src.index(end, i)
        markup = src[i:j]
        markup = re.sub(r"<svg.*?</svg>", "", markup, flags=re.S)
        markup = re.sub(r"<[^>]+>", "", markup)
        markup = re.sub(r"\{[^}]*\}", "", markup)
        chars.update(c for c in markup if not c.isspace())
    return "".join(sorted(chars))


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ttf_dir = Path(sys.argv[1])
    text = hero_text()
    print(f"{len(text)} chars: {text}")
    for name, weight in WEIGHTS.items():
        out = OUT / f"m-plus-rounded-1c-hero-{weight}.woff2"
        subprocess.run(
            [
                "pyftsubset",
                str(ttf_dir / f"MPLUSRounded1c-{name}.ttf"),
                f"--text={text} ",
                "--flavor=woff2",
                "--layout-features=*",
                f"--output-file={out}",
            ],
            check=True,
        )
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
