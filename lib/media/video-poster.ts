/** Capture the selected decoded frame. CORS restrictions are reported to the UI. */
export async function videoPosterFile(video: HTMLVideoElement): Promise<File> {
  if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
    throw new Error("Aguarde o vídeo carregar o momento escolhido.");
  }
  const scale = Math.min(1, 1080 / video.videoWidth, 1920 / video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador não conseguiu gerar a capa.");
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível gerar a capa.")), "image/jpeg", 0.85));
    return new File([blob], `capa-${Math.round(video.currentTime * 1000)}.jpg`, { type: "image/jpeg" });
  } catch {
    throw new Error("Não foi possível capturar este vídeo. Para links externos, o servidor precisa permitir captura de imagem. Você também pode enviar uma capa manualmente.");
  }
}
