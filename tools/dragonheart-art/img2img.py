#!/usr/bin/env python3
"""SDXL img2img through a local ComfyUI: repaint a reference image (a scan) into new art that
keeps its composition. Used for Dragonheart iteration 1 (board, cards, back).

Usage: python3 img2img.py jobs-img2img.json OUT_DIR [--only name1,name2]
Each job: {"name", "input" (path), "width", "height", "prompt", "negative"?, "seed", "denoise",
           "steps"?, "cfg"?}
The input is resized to width×height (multiples of 8) before encoding; OUT_DIR/<name>.png is the raw result.
"""
import json, os, sys, time, urllib.parse, urllib.request, uuid

HOST = os.environ.get('COMFY_HOST', 'http://127.0.0.1:8188')
SDXL_CKPT = os.environ.get('SDXL_CKPT', 'sd_xl_base_1.0.safetensors')
DEFAULT_NEG = ('text, letters, watermark, signature, logo, cartoon, anime, cel shading, 3d render, '
               'blurry, lowres, jpeg artifacts, deformed, extra limbs, extra fingers, nude, nsfw, photo')


def upload(path, name):
    from PIL import Image
    import io
    boundary = uuid.uuid4().hex
    buf = io.BytesIO()
    Image.open(path).convert('RGB').save(buf, 'PNG')
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
            f'Content-Type: image/png\r\n\r\n').encode() + buf.getvalue() + \
           (f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue'
            f'\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(HOST + '/upload/image', data=body,
                                 headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    return json.loads(urllib.request.urlopen(req).read())['name']


def workflow(job, image_name):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": SDXL_CKPT}},
        "2": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "3": {"class_type": "ImageScale", "inputs": {"image": ["2", 0], "upscale_method": "lanczos",
              "width": job["width"], "height": job["height"], "crop": "disabled"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["1", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": job.get("negative", DEFAULT_NEG), "clip": ["1", 1]}},
        "6": {"class_type": "VAEEncodeTiled", "inputs": {"pixels": ["3", 0], "vae": ["1", 2], "tile_size": 512,
              "overlap": 64, "temporal_size": 64, "temporal_overlap": 8}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0],
              "latent_image": ["6", 0], "seed": job.get("seed", 1), "steps": job.get("steps", 30),
              "cfg": job.get("cfg", 6.0), "sampler_name": "dpmpp_2m", "scheduler": "karras",
              "denoise": job["denoise"]}},
        "8": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["7", 0], "vae": ["1", 2], "tile_size": 512,
              "overlap": 64, "temporal_size": 64, "temporal_overlap": 8}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "dragonheart-i2i/" + job["name"]}},
    }


def post(path, data):
    req = urllib.request.Request(HOST + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def run(job, out_dir):
    image_name = upload(job["input"], job["name"] + "-src.png")
    pid = post("/prompt", {"prompt": workflow(job, image_name), "client_id": uuid.uuid4().hex})["prompt_id"]
    while True:
        time.sleep(2)
        hist = json.loads(urllib.request.urlopen(f"{HOST}/history/{pid}").read())
        if pid in hist and hist[pid].get("outputs"):
            img = hist[pid]["outputs"]["9"]["images"][0]
            q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]})
            data = urllib.request.urlopen(f"{HOST}/view?{q}").read()
            path = os.path.join(out_dir, job["name"] + ".png")
            open(path, "wb").write(data)
            return path
        if pid in hist and hist[pid].get("status", {}).get("status_str") == "error":
            raise RuntimeError(json.dumps(hist[pid]["status"])[:500])


if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1]))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    for job in jobs:
        if only and job["name"] not in only:
            continue
        t = time.time()
        print(job["name"], "->", run(job, out_dir), f"{time.time() - t:.0f}s", flush=True)
