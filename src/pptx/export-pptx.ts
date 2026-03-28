import pptxgen from 'pptxgenjs';

export interface PptxSlideAsset {
  name: string;
  mp4Path: string;
  width: number;
  height: number;
}

function fitMedia(width: number, height: number): { x: number; y: number; w: number; h: number } {
  const slideWidth = 13.33;
  const slideHeight = 7.5;
  const topOffset = 0.8;
  const availableWidth = slideWidth;
  const availableHeight = slideHeight - topOffset;

  if (width <= 0 || height <= 0) {
    return { x: 0, y: topOffset, w: availableWidth, h: availableHeight };
  }

  const scale = Math.min(availableWidth / width, availableHeight / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;

  return {
    x: (slideWidth - fittedWidth) / 2,
    y: topOffset + (availableHeight - fittedHeight) / 2,
    w: fittedWidth,
    h: fittedHeight,
  };
}

export async function exportPptx(
  slides: PptxSlideAsset[],
  outputPath: string,
): Promise<void> {
  const PptxGenJS = pptxgen as unknown as new () => {
    layout: string;
    author: string;
    company: string;
    subject: string;
    title: string;
    addSlide(): {
      addText(text: string, options: Record<string, unknown>): void;
      addMedia(options: Record<string, unknown>): void;
    };
    writeFile(options: { fileName: string }): Promise<string>;
  };

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenCode';
  pptx.company = 'OpenCode';
  pptx.subject = 'Excalidraw animations';
  pptx.title = 'Excalidraw animations';

  for (const slideAsset of slides) {
    const slide = pptx.addSlide();
    const media = fitMedia(slideAsset.width, slideAsset.height);
    slide.addText(slideAsset.name, { x: 0.4, y: 0.2, w: 9.2, h: 0.4, fontSize: 20 });
    slide.addMedia({
      type: 'video',
      path: slideAsset.mp4Path,
      x: media.x,
      y: media.y,
      w: media.w,
      h: media.h,
    });
  }

  await pptx.writeFile({ fileName: outputPath });
}
