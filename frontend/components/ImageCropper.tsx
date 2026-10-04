"use client";
import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

export type CropKind = "avatar" | "banner";

const OUTPUT: Record<CropKind, { w: number; h: number }> = {
  avatar: { w: 256, h: 256 },
  banner: { w: 1024, h: 256 },
};

/** Draw the selected pixels to a canvas and return a JPEG blob. */
async function croppedBlob(
  src: string,
  pixels: Area,
  kind: CropKind
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read the image."));
    el.src = src;
  });
  const { w, h } = OUTPUT[kind];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(img, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("Crop failed.");
  return blob;
}

/**
 * Crop-before-upload modal. Drag to frame, scroll/pinch or slider to zoom,
 * then Apply. Square for avatars (round preview), wide for banners.
 */
export default function ImageCropper({
  src,
  kind,
  onCancel,
  onApply,
}: {
  src: string;
  kind: CropKind;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  async function handleApply() {
    if (!pixels) return;
    setWorking(true);
    setError("");
    try {
      onApply(await croppedBlob(src, pixels, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crop failed.");
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-1">
          {kind === "avatar" ? "Frame your photo" : "Frame your banner"}
        </h2>
        <p className="text-sm text-[var(--faint)] mb-4">
          Drag to position{kind === "avatar" ? " (square crop)" : " (wide crop)"} · zoom to fit.
        </p>

        <div className="relative w-full h-72 bg-black rounded-xl overflow-hidden mb-4">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={kind === "avatar" ? 1 : 4}
            cropShape={kind === "avatar" ? "round" : "rect"}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-[var(--faint)]">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#2563EB]"
          />
        </div>

        {error && (
          <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={working}
            className="flex-1 bg-[var(--surface-2)] hover:bg-[var(--border)] border border-[var(--border)] disabled:opacity-50 font-semibold py-2.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={working || !pixels}
            className="flex-1 bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            {working ? "Cropping..." : "Apply & Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
