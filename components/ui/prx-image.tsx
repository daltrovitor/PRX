// Hello World
"use client";

import Image, { type ImageProps } from "next/image";
import { useDecompressedImage, type ImageSource } from "@/lib/media/use-decompressed-image";
import { isCompressedImageData } from "@/lib/media/compression";
import { isOptimizableImage } from "@/lib/media/image-hosts";
import { cn } from "@/lib/utils";

export interface PrxImageProps extends Omit<ImageProps, "src"> {
  src: ImageSource;
  fallbackClassName?: string;
}

/**
 * Componente de imagem oficial da PRX.
 * Aceita todas as propriedades de `next/image` e descompacta automaticamente
 * qualquer imagem compactada que veio do banco de dados (prx:gz:...).
 */
export function PrxImage({ src, alt, className, fallbackClassName, unoptimized, ...rest }: PrxImageProps) {
  const resolvedSrc = useDecompressedImage(src);
  const isCompressed = typeof src === "string" && isCompressedImageData(src);
  const isPending = isCompressed && resolvedSrc === src;

  if (!resolvedSrc || isPending) {
    return <div aria-hidden className={cn("h-full w-full bg-surface/50 transition-opacity", fallbackClassName, className)} />;
  }

  const isDataUrl = typeof resolvedSrc === "string" && resolvedSrc.startsWith("data:");

  return (
    <Image
      {...rest}
      src={resolvedSrc}
      alt={alt}
      unoptimized={isDataUrl || !isOptimizableImage(resolvedSrc) ? true : unoptimized}
      className={className}
    />
  );
}
