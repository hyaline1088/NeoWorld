"""Extract Scene 01's construction record from scene.glb into a small JSON file for the v2 page.

Every object (Entity__* node) is listed with its parts. A part keeps the SDK operation and parameters
recorded in its glTF extras (neoblender_sdk_cad_intent) when one exists; otherwise it is marked as a mesh
with its world-space size. Status notes written by the pipeline (for example UNRESOLVED_NOT_MODELED)
are kept verbatim. Run: python scripts/extract-scene-record.py
"""
from pathlib import Path
import json
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "assets/studio/scenes/scene-01/scene.glb"
OUT = ROOT / "preview/v2/data/scene-01-record.json"


def local_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    t = np.array(node.get("translation", [0, 0, 0]), dtype=float)
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = np.array(node.get("scale", [1, 1, 1]), dtype=float)
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


def rounded(v, places=6):
    if isinstance(v, float):
        return round(v, places)
    if isinstance(v, list):
        return [rounded(x, places) for x in v]
    if isinstance(v, dict):
        return {k: rounded(x, places) for k, x in v.items()}
    return v


def main():
    data = GLB.read_bytes()
    length = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + length])
    nodes, meshes, accessors = gltf["nodes"], gltf["meshes"], gltf["accessors"]
    world, parent = {}, {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    def world_of(i):
        if i not in world:
            m = local_matrix(nodes[i])
            world[i] = world_of(parent[i]) @ m if i in parent else m
        return world[i]

    def size_of(i):
        """World-space bounding-box size of a node's own mesh, in metres."""
        mesh = nodes[i].get("mesh")
        if mesh is None:
            return None
        lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
        for prim in meshes[mesh]["primitives"]:
            acc = accessors[prim["attributes"]["POSITION"]]
            a, b = np.array(acc["min"]), np.array(acc["max"])
            for corner in [[x, y, z] for x in (a[0], b[0]) for y in (a[1], b[1]) for z in (a[2], b[2])]:
                p = world_of(i) @ np.array([*corner, 1.0])
                lo, hi = np.minimum(lo, p[:3]), np.maximum(hi, p[:3])
        return [round(float(v), 3) for v in hi - lo]

    def entity_of(i):
        while i is not None:
            if nodes[i]["name"].startswith("Entity__"):
                return i
            i = parent.get(i)
        return None

    entities = {}
    for i, n in enumerate(nodes):
        if "mesh" not in n:
            continue
        e = entity_of(i)
        key = nodes[e]["name"] if e is not None else "Background"
        if key not in entities:
            extras = nodes[e].get("extras", {}) if e is not None else {}
            entities[key] = {"node": key, "id": extras.get("neoworld_instance_id", key.replace("Entity__", "")),
                             "representation": extras.get("neoworld_representation"),
                             "notes": {k: v for k, v in extras.items() if k not in ("neoworld_instance_id", "neoworld_representation")},
                             "parts": []}
        extras = n.get("extras", {})
        part = {"node": n["name"], "part": n["name"].split("__")[-1], "size": size_of(i)}
        if "neoworld_part_id" in extras:
            part["partId"] = extras["neoworld_part_id"]
        role = extras.get("neosdk_geometry_role") or extras.get("geometry_role")
        if role:
            part["role"] = role
        intent = extras.get("neoblender_sdk_cad_intent")
        if intent:
            intent = json.loads(intent) if isinstance(intent, str) else intent
            part["op"] = intent["operation"]
            part["params"] = rounded(intent["parameters"])
            part["exact"] = bool(intent.get("exact_candidate"))
        other = {k: v for k, v in extras.items() if k not in ("neoworld_part_id", "neosdk_geometry_role", "geometry_role", "neoblender_sdk_cad_intent", "neoworld_instance_id")}
        if other:
            part["notes"] = other
        entities[key]["parts"].append(part)

    ordered = sorted(entities.values(), key=lambda e: (e["node"] == "Background", -sum("op" in p for p in e["parts"]), -len(e["parts"])))
    record = {"source": "assets/studio/scenes/scene-01/scene.glb", "frame": "scan world, z up, metres", "entities": ordered}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ops = sum("op" in p for e in ordered for p in e["parts"])
    parts = sum(len(e["parts"]) for e in ordered)
    print(f"{len(ordered)} objects, {parts} parts, {ops} with a recorded operation -> {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
