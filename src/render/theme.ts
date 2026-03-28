const THEME_FILTER = 'invert(93%) hue-rotate(180deg)';
const IMAGE_CORRECTION = 'invert(100%) hue-rotate(180deg) saturate(1.25)';

export function applyThemeToSvg(
  svg: SVGSVGElement,
  theme: 'light' | 'dark',
): SVGSVGElement {
  if (theme !== 'dark') {
    return svg;
  }

  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.style.filter = THEME_FILTER;

  cloned.querySelectorAll<SVGImageElement>('image').forEach((image) => {
    const href = image.getAttribute('href') || image.getAttribute('xlink:href') || '';

    if (/^data:image\/svg\+xml/i.test(href) || /\.svg(?:$|\?)/i.test(href)) {
      return;
    }

    const current = image.style.filter?.trim() || '';
    if (!current.includes(IMAGE_CORRECTION)) {
      image.style.filter = current ? `${current} ${IMAGE_CORRECTION}` : IMAGE_CORRECTION;
    }
  });

  return cloned;
}
