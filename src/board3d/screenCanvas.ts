// VGA ekranının tuvali: hem yan paneldeki monitör hem 3D sahnedeki monitör aynı tuvali gösterir.
// Worker'dan gelen görüntü (metin kipi ya da ışın kipi) sürüm değişince bir kez boyanır.

import { liveScreen } from "./store";
import { paintFrame } from "./screen";

const W = 640;
const H = 480;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;
let painted = -1;

export function screenCanvas(): HTMLCanvasElement {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    image = ctx.createImageData(W, H);
  }
  return canvas;
}

/**
 * Görüntü değiştiyse tuvali boyar. Boyanan sürümü döndürür: tuvali kullanan her yer (panel, 3D
 * doku) kendi gördüğü sürümle karşılaştırır.
 */
export function updateScreenCanvas(): number {
  screenCanvas();
  if (painted !== liveScreen.version) {
    painted = liveScreen.version;
    paint();
  }
  return painted;
}

function paint(): boolean {
  const beam = liveScreen.beam;
  const frame = liveScreen.frame;
  if (beam && beam.width === W && beam.height === H) {
    image!.data.set(beam.rgba);
    ctx!.putImageData(image!, 0, 0);
    // ışının yeri: küçük bir artı
    if (beam.x >= 0 && beam.x < W && beam.y >= 0 && beam.y < H) {
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(beam.x - 6, beam.y, 13, 1);
      ctx!.fillRect(beam.x, beam.y - 6, 1, 13);
    }
    return true;
  }
  if (frame && frame.width === W && frame.height === H) {
    paintFrame(frame.pixels, image!.data);
    ctx!.putImageData(image!, 0, 0);
    return true;
  }
  if (frame) {
    // başka çözünürlük (ör. küçük piksel tamponu): ölçekleyerek
    const small = new ImageData(frame.width, frame.height);
    paintFrame(frame.pixels, small.data);
    const tmp = document.createElement("canvas");
    tmp.width = frame.width;
    tmp.height = frame.height;
    tmp.getContext("2d")!.putImageData(small, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    ctx!.drawImage(tmp, 0, 0, W, H);
    return true;
  }
  return false;
}
