declare module 'gifenc' {
  type GifPalette = unknown

  type GifFrameOptions = {
    delay?: number
    palette?: GifPalette
  }

  type GifEncoder = {
    bytes: () => Uint8Array
    finish: () => void
    writeFrame: (
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options?: GifFrameOptions,
    ) => void
  }

  export const GIFEncoder: () => GifEncoder
  export const applyPalette: (
    rgbaPixels: Uint8Array,
    palette: GifPalette,
  ) => Uint8Array
  export const quantize: (rgbaPixels: Uint8Array, maxColors: number) => GifPalette
}
