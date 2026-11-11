// Hello World
import { describe, expect, it, vi } from "vitest";
import { detectBrowser, detectPlatform, offerInstallAfterSignup } from "@/lib/pwa-install";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

describe("detecção do sistema e do navegador para instalar o PWA", () => {
  it("reconhece Android e Windows (e o iPad que se diz Mac)", () => {
    expect(detectPlatform(UA.androidChrome)).toBe("android");
    expect(detectPlatform(UA.windowsEdge)).toBe("windows");
    expect(detectPlatform(UA.iphone)).toBe("ios");
    expect(detectPlatform(UA.ipadDesktop, 5)).toBe("ios");
    expect(detectPlatform(UA.ipadDesktop, 0)).toBe("macos");
  });

  it("separa Chrome, Edge, Samsung Internet, Firefox e Safari", () => {
    expect(detectBrowser(UA.androidChrome)).toBe("chrome");
    expect(detectBrowser(UA.androidSamsung)).toBe("samsung");
    expect(detectBrowser(UA.androidFirefox)).toBe("firefox");
    expect(detectBrowser(UA.windowsEdge)).toBe("edge");
    expect(detectBrowser(UA.windowsChrome)).toBe("chrome");
    expect(detectBrowser(UA.windowsFirefox)).toBe("firefox");
    expect(detectBrowser(UA.iphone)).toBe("safari");
  });
});

describe("convite de instalação após cadastro", () => {
  it("limpa o descarte anterior ao criar uma conta no navegador", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", { standalone: false });
    vi.stubGlobal("localStorage", { removeItem });
    try {
      offerInstallAfterSignup();
      expect(removeItem).toHaveBeenCalledWith("prx_pwa_card");
    } finally { vi.unstubAllGlobals(); }
  });
  it("não oferece instalação quando já está no app instalado", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("navigator", { standalone: true });
    vi.stubGlobal("localStorage", { removeItem });
    try {
      offerInstallAfterSignup();
      expect(removeItem).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
