/** Re-encode large uploads locally: 720p, 24fps, 1.6 Mbps plus audio.
 * No file leaves the device until encoding succeeds. Unsupported browsers keep
 * the original; the caller can also explicitly select original quality.
 */
export async function optimizeVideo(file: File, onProgress?: (percent: number) => void): Promise<File> {
  if (file.size < 8 * 1024 * 1024 || typeof MediaRecorder === "undefined" ||
      typeof AudioContext === "undefined" || !HTMLCanvasElement.prototype.captureStream) return file;
  const mimeType = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const audio = new AudioContext();
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await audio.resume();
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Tempo esgotado ao abrir o vídeo.")), 15000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => reject(new Error("Não foi possível abrir este vídeo para otimizar."));
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 180) return file;
    const scale = Math.min(1, 720 / Math.min(video.videoWidth, video.videoHeight), 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const source = audio.createMediaElementSource(video);
    const destination = audio.createMediaStreamDestination();
    source.connect(destination);
    stream = canvas.captureStream(24);
    destination.stream.getAudioTracks().forEach((track) => stream!.addTrack(track));
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_600_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    const blob = await new Promise<Blob>((resolve, reject) => {
      let lastPercent = -1;
      const draw = () => {
        const percent = Math.min(99, Math.floor(video.currentTime / video.duration * 100));
        if (percent !== lastPercent) { lastPercent = percent; onProgress?.(percent); }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height); frame = requestAnimationFrame(draw); };
      recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder!.onerror = () => reject(new Error("Falha ao otimizar. Tente enviar na qualidade original."));
      recorder!.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      video.onended = () => { if (recorder!.state !== "inactive") recorder!.stop(); };
      video.onerror = () => reject(new Error("Falha ao ler o vídeo."));
      timer = setTimeout(() => reject(new Error("Otimização demorou demais. Tente a qualidade original.")), video.duration * 2000 + 15000);
      draw();
      recorder!.start(1000);
      void video.play().catch(reject);
    });
    onProgress?.(100);
    if (!blob.size) throw new Error("Vídeo otimizado vazio. Tente a qualidade original.");
    if (blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + (blob.type === "video/mp4" ? ".mp4" : ".webm"), { type: blob.type });
  } finally {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    video.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    await audio.close().catch(() => undefined);
  }
}
