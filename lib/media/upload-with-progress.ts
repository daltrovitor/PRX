/** Upload progress measures bytes transferred; 100% requires server success. */
export function uploadWithProgress(
  url: string,
  method: "POST" | "PUT",
  body: FormData,
  headers: Record<string, string>,
  onProgress?: (percent: number | null) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 10 * 60 * 1000;
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => onProgress?.(event.lengthComputable
      ? Math.min(99, Math.floor(event.loaded / event.total * 100)) : null);
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo. Tente novamente."));
    xhr.ontimeout = () => reject(new Error("O envio demorou demais. Confira a conexão e tente novamente."));
    xhr.onabort = () => reject(new Error("Envio cancelado."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.responseText);
      } else {
        reject(new Error(`O envio foi recusado (${xhr.status}). Tente novamente.`));
      }
    };
    onProgress?.(0);
    xhr.send(body);
  });
}
