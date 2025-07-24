# File: api_server.py - CORRECTED VERSION WITHOUT EMOJIS

import io
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import AutoModelForImageSegmentation
import torch
from torchvision import transforms

# --- 1. Model Loading (Happens only once on startup) ---
print("BG-Remover: Loading BiRefNet model. This might take a moment...")
torch.set_float32_matmul_precision(["high", "highest"][0])

try:
    birefnet = AutoModelForImageSegmentation.from_pretrained("ZhengPeng7/BiRefNet", trust_remote_code=True)
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    birefnet.to(device)
    # --- CHANGED: Emoji removed from the line below ---
    print(f"OK: Model loaded successfully on device: {device}")
except Exception as e:
    # --- CHANGED: Emoji removed from the line below ---
    print(f"ERROR: Failed to load model: {e}")
    exit()

# Image transformation pipeline
transform_image = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

# --- 2. FastAPI Application Setup ---
app = FastAPI(title="Background Remover API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. API Endpoints ---
@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        original_size = image.size

        input_tensor = transform_image(image).unsqueeze(0).to(device)

        with torch.no_grad():
            preds = birefnet(input_tensor)[-1].sigmoid().cpu()
        
        pred_mask = transforms.ToPILImage()(preds[0].squeeze())
        mask = pred_mask.resize(original_size)

        final_image = image.copy()
        final_image.putalpha(mask)

        img_buffer = io.BytesIO()
        final_image.save(img_buffer, format="PNG")
        img_buffer.seek(0)

        return StreamingResponse(img_buffer, media_type="image/png")
    except Exception as e:
        print(f"ERROR: Could not process image: {e}")
        return {"error": "Failed to process the image."}, 500

@app.get("/")
def read_root():
    return {"status": "Background Remover API is online."}

# --- 4. Server Start Function ---
def start_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

if __name__ == "__main__":
    start_server()