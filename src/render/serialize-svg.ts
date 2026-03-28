export function serializeSvg(svgText: string): string {
  return svgText.endsWith('\n') ? svgText : `${svgText}\n`;
}
