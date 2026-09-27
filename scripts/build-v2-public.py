"""Build a public preview of preview/v2 into site-v2/, with every paper-derived block removed.

Blocks between <!-- paper:start --> and <!-- paper:end --> are deleted, and the <template data-public>
that follows each one is unwrapped in its place. The build then fails if any paper-specific term
survives in the HTML, CSS or JS, so unpublished results cannot leak by accident.
Run: python scripts/build-v2-public.py   Preview: python -m http.server 8766 -d site-v2
"""
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "preview"
OUT = ROOT / "site-v2"
FORBIDDEN = ["paper:start", "data-public", "RoboCasa", "ALOHA", "3DCodeBench", "PartNet", "Articraft", "VIGA",
             "Chamfer", "DINOv3", "ICLR", "double-blind", "0.0365", "87.74", "33.33", "MuJoCo", "Adam"]
VENDOR = ["three.min.js", "three.LICENSE", "OBJLoader.js", "OrbitControls.js", "GLTFLoader.js", "DRACOLoader.js",
          "gsap.min.js", "ScrollTrigger.min.js", "draco/draco_decoder.js", "draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js"]
ASSETS = [
    "fusion-pixel-latin-subset.woff2",
    "studio/scenes/scene-01/scene-wireframe.bin", "studio/scenes/scene-01/scene.glb",
    "studio/videos/scene-01.mp4", "studio/posters/scene-01.jpg",
    "architecture/audit.gif", "architecture/place-render.gif", "architecture/fit.gif", "architecture/admit.gif",
    *[f"batch5_collision_references_image3/{i}_image_3.png" for i in ["10449", "8994", "101917", "101463", "103967"]],
    *[f"reference_image_3_5ids/reference_image_3/{i}.png" for i in ["100520", "100842", "101052", "101220", "101284"]],
]
OBJECTS = ["10449", "8994", "101917", "101463", "103967", "100520", "100842", "101052", "101220", "101284"]


def copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def strip_paper(html: str) -> str:
    # The note explaining the markers mentions them by name, so it has to go first.
    html = re.sub(r"[ \t]*<!-- Paper-derived blocks.*?-->\n", "", html, flags=re.S)
    html = re.sub(r"[ \t]*<!-- paper:start -->.*?<!-- paper:end -->", "", html, flags=re.S)
    return re.sub(r"<template data-public>(.*?)</template>", r"\1", html, flags=re.S)


def build() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    v2 = SRC / "v2"
    (OUT / "v2").mkdir(parents=True)
    (OUT / "v2" / "index.html").write_text(strip_paper((v2 / "index.html").read_text(encoding="utf-8")), encoding="utf-8")
    for path in [v2 / "v2.css", *sorted((v2 / "js").glob("*.js")), *sorted((v2 / "fonts").iterdir()), *sorted((v2 / "data").glob("*.json"))]:
        copy(path, OUT / "v2" / path.relative_to(v2))
    for name in VENDOR:
        copy(SRC / "vendor" / name, OUT / "vendor" / name)
    for name in ["neoworld-nw-small.svg", "neoworld-favicon.svg"]:
        copy(SRC / "brand" / name, OUT / "brand" / name)
    for name in ASSETS:
        copy(ROOT / "assets" / name, OUT / "assets" / name)
    urdf = ROOT / "assets" / "batch5_collision_urdf_textured"
    for obj in OBJECTS:
        for path in (urdf / obj).rglob("*"):
            if not path.is_file() or path.suffix.lower() in {".md", ".json"}:
                continue
            if path.suffix.lower() == ".png" and path.with_suffix(".webp").exists():
                continue  # the runtime materials use the WebP copies
            copy(path, OUT / "assets" / path.relative_to(ROOT / "assets"))
    (OUT / "index.html").write_text('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
                                    '<meta http-equiv="refresh" content="0; url=v2/"><title>NeoWorld-3 preview</title>'
                                    '<a href="v2/">Open the NeoWorld-3 design preview</a>\n', encoding="utf-8")
    (OUT / ".nojekyll").touch()

    leaks = []
    for path in OUT.rglob("*"):
        if path.suffix in {".html", ".css", ".js", ".json"} and "vendor" not in path.parts:
            text = path.read_text(encoding="utf-8")
            leaks += [f"{path.relative_to(OUT)}: {term}" for term in FORBIDDEN if term in text]
    if leaks:
        shutil.rmtree(OUT)
        sys.exit("Build stopped, paper-specific terms found:\n  " + "\n  ".join(leaks))
    files = [p for p in OUT.rglob("*") if p.is_file()]
    print(f"Public preview: {len(files)} files, {sum(p.stat().st_size for p in files) / 1024 / 1024:.1f} MiB -> {OUT}")


if __name__ == "__main__":
    build()
