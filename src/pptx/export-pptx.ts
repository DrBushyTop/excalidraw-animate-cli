import pptxgen from 'pptxgenjs';

export interface PptxSlideAsset {
  name: string;
  mp4Path: string;
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
    slide.addText(slideAsset.name, { x: 0.4, y: 0.2, w: 9.2, h: 0.4, fontSize: 20 });
    slide.addMedia({
      type: 'video',
      path: slideAsset.mp4Path,
      x: 0,
      y: 0.6,
      w: 10,
      h: 5.025,
    });
  }

  await pptx.writeFile({ fileName: outputPath });
}
