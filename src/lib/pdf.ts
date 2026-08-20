type PdfModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfModule> | null = null;

// Loaded once and cached so the first extraction is the only one paying setup cost.
export function loadPdfjs(): Promise<PdfModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: buffer,
    disableAutoFetch: true,
    disableFontFace: true,
  }).promise;

  const pages = await Promise.all(
    Array.from({ length: doc.numPages }, async (_unused, index) => {
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      page.cleanup();
      return text;
    }),
  );

  const result = pages.join("\n\n").trim();
  return result;
}
