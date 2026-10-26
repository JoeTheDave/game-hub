#!/usr/bin/env python3
"""Generate Dragonheart images through a local ComfyUI (Flux fp8 or SDXL) via its HTTP API.

Usage: python3 comfy_gen.py jobs.json OUT_DIR [--only name1,name2]
jobs.json: [{"name": "...", "prompt": "...", "width": 832, "height": 1152, "seed": 1, "steps": 20}]
Writes OUT_DIR/<name>.png (raw, full size). Post-processing lives in process_assets.py.
"""
import json, sys, time, urllib.request, urllib.parse, uuid, os

HOST = os.environ.get('COMFY_HOST', 'http://127.0.0.1:8188')
CKPT = os.environ.get('FLUX_CKPT', 'fluxedUpFluxNSFW_112_fp8.safetensors')


SDXL_CKPT = os.environ.get('SDXL_CKPT', 'sd_xl_base_1.0.safetensors')
DEFAULT_NEG = 'nude, nudity, naked, cleavage, nsfw, text, letters, watermark, signature, frame, border, deformed, extra fingers, photo'


def workflow_sdxl(job):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": SDXL_CKPT}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["1", 1]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": job.get("negative", DEFAULT_NEG), "clip": ["1", 1]}},
        "7": {"class_type": "EmptyLatentImage", "inputs": {"width": job["width"], "height": job["height"], "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["6", 0], "latent_image": ["7", 0],
              "seed": job.get("seed", 1), "steps": job.get("steps", 30), "cfg": job.get("cfg", 6.5), "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "9": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["8", 0], "vae": ["1", 2], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "dragonheart/" + job["name"]}},
    }


def workflow(job):
    if job.get("model") == "sdxl":
        return workflow_sdxl(job)
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "clip_l.safetensors", "clip_name2": "t5xxl_fp8_e4m3fn.safetensors", "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["2", 0]}},
        "5": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": job.get("guidance", 3.5)}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": job["width"], "height": job["height"], "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
              "seed": job.get("seed", 1), "steps": job.get("steps", 20), "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["8", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "dragonheart/" + job["name"]}},
    }


def post(path, data):
    req = urllib.request.Request(HOST + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def is_degenerate(path):
    """ROCm/fp8 occasionally yields an all-NaN (black) or flat image; detect and retry."""
    try:
        from PIL import Image, ImageStat
        st = ImageStat.Stat(Image.open(path).convert('L'))
        return st.stddev[0] < 10
    except ImportError:
        return False


def run(job, out_dir, attempt=0):
    if attempt:
        job = dict(job, seed=job.get('seed', 1) + 1000 * attempt)
    pid = post("/prompt", {"prompt": workflow(job), "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        hist = json.loads(urllib.request.urlopen(f"{HOST}/history/{pid}").read())
        if pid in hist:
            h = hist[pid]
            st = h.get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(json.dumps(st)[:2000])
            imgs = [i for o in h["outputs"].values() for i in o.get("images", [])]
            if imgs:
                im = imgs[0]
                q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})
                data = urllib.request.urlopen(f"{HOST}/view?{q}").read()
                path = os.path.join(out_dir, job["name"] + ".png")
                open(path, "wb").write(data)
                if is_degenerate(path) and attempt < 4:
                    print(f"{job['name']}: degenerate output, retrying", flush=True)
                    return run(job, out_dir, attempt + 1)
                print(f"{job['name']}: {time.time()-t0:.0f}s seed={job.get('seed')}", flush=True)
                return
        if time.time() - t0 > 1800:
            raise TimeoutError(job["name"])


if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    for j in jobs:
        if only and j["name"] not in only:
            continue
        run(j, out)
