import * as pdfjs from "pdfjs-dist";
import { createWorker } from "tesseract.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type ImportedPaperQuestion = {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  prompt: string;
  options: string[];
  answer: string;
  acceptedAnswers: string[];
  pairs: { left: string; right: string }[];
  explanation: string;
  points: number;
  difficulty: "Standard";
  topic: string;
};

type ProgressCallback = (message: string) => void;

type PaperBlock = { number: string; lines: string[] };

function textFromPageItems(items: unknown[]): string {
  const textItems = items.filter((item): item is { str: string; transform: number[] } =>
    Boolean(item && typeof item === "object" && "str" in item && typeof (item as { str?: unknown }).str === "string"
      && "transform" in item && Array.isArray((item as { transform?: unknown }).transform)),
  );
  const rows: { y: number; parts: { x: number; text: string }[] }[] = [];
  for (const item of textItems) {
    const x = Number(item.transform[4] ?? 0);
    const y = Number(item.transform[5] ?? 0);
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 2.5);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y)
    .map(row => row.parts.sort((a, b) => a.x - b.x).map(part => part.text.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
}

async function extractPdfText(file: File, onProgress: ProgressCallback): Promise<{ text: string; pageCount: number }> {
  const buffer = await file.arrayBuffer();
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    if (document.numPages > 60) {
      throw new Error("This paper has more than 60 pages. Split it into smaller sections before importing.");
    }
    const pages: { page: number; text: string }[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      onProgress("Reading PDF text · page " + index + " of " + document.numPages);
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push({ page: index, text: textFromPageItems(content.items) });
    }

    const scanned = pages.filter(page => page.text.replace(/\s/g, "").length < 35);
    if (scanned.length) {
      if (scanned.length > 25) {
        throw new Error("This appears to be a scanned paper with more than 25 image-only pages. Split it into smaller sections and import each section separately.");
      }
      onProgress("Scanned pages detected · preparing on-device English OCR…");
      const worker = await createWorker("eng", 1, {
        logger: message => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            onProgress("Reading scanned pages · " + Math.round(message.progress * 100) + "%");
          }
        },
      });
      try {
        for (let index = 0; index < pages.length; index += 1) {
          if (pages[index].text.replace(/\s/g, "").length >= 35) continue;
          onProgress("Recognising scanned page " + pages[index].page + " of " + document.numPages);
          const page = await document.getPage(pages[index].page);
          const viewport = page.getViewport({ scale: 1.65 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Your browser could not prepare a page for OCR.");
          await page.render({ canvasContext: context, viewport }).promise;
          const result = await worker.recognize(canvas);
          pages[index].text = result.data.text || "";
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        await worker.terminate();
      }
    }

    return { text: pages.map(page => page.text).join("\n\n"), pageCount: document.numPages };
  } finally {
    await document.destroy();
  }
}

function findOptions(lines: string[]): { stemLines: string[]; options: string[] } {
  const options: string[] = [];
  const stemLines: string[] = [];
  const optionPattern = /(?:^|\s)(?:\(([A-D])\)|([A-D])[.)])\s+(.+?)(?=\s+(?:\([A-D]\)|[A-D][.)])\s+|$)/gi;
  let optionsStarted = false;
  for (const line of lines) {
    const matches = Array.from(line.matchAll(optionPattern));
    if (!matches.length) {
      if (optionsStarted) {
        if (options.length) options[options.length - 1] += " " + line.trim();
      } else {
        stemLines.push(line);
      }
      continue;
    }
    const firstIndex = matches[0].index ?? 0;
    if (!optionsStarted && firstIndex > 0) stemLines.push(line.slice(0, firstIndex));
    optionsStarted = true;
    for (const match of matches) {
      const value = (match[3] || "").trim();
      if (value) options.push(value);
    }
  }
  return { stemLines, options: options.slice(0, 4) };
}

function marksFor(text: string): number {
  const matches = [
    ...text.matchAll(/\[\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\]/gi),
    ...text.matchAll(/\(\s*(\d+(?:\.\d+)?)\s*marks?\s*\)/gi),
  ];
  const values = matches.map(match => Number(match[1])).filter(value => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(0.5, Math.min(100, values[values.length - 1])) : 1;
}

function stripMarks(text: string): string {
  return text
    .replace(/\[\s*\d+(?:\.\d+)?\s*(?:marks?)?\s*\]/gi, "")
    .replace(/\(\s*\d+(?:\.\d+)?\s*marks?\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSubparts(block: PaperBlock): { number: string; text: string }[] {
  const partPattern = /^\s*(?:\(([a-z])\)|([a-z])[.)])\s*(.*)$/;
  const parts: { index: number; label: string; first: string }[] = [];
  block.lines.forEach((line, index) => {
    const match = line.match(partPattern);
    if (match) parts.push({ index, label: match[1] || match[2], first: match[3] || "" });
  });
  if (parts.length < 2) {
    return [{ number: block.number, text: block.lines.join("\n") }];
  }
  const intro = block.lines.slice(0, parts[0].index).join("\n").trim();
  return parts.map((part, index) => {
    const end = parts[index + 1]?.index ?? block.lines.length;
    const detail = [part.first, ...block.lines.slice(part.index + 1, end)].filter(Boolean).join("\n");
    return {
      number: block.number + "(" + part.label + ")",
      text: [intro, detail].filter(Boolean).join("\n"),
    };
  });
}

export function parsePastPaperQuestions(source: string): ImportedPaperQuestion[] {
  const lines = source.replace(/\r/g, "\n").split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(line => line.length > 1)
    .filter(line => !/^(?:page\s+\d+(?:\s+of\s+\d+)?|turn over|turn the page|continued|copyright|©|www\.)/i.test(line));

  const startPattern = /^(?:question\s+)?(\d{1,2}(?:\.\d{1,2}){0,2})[.)]\s*(.*)$/i;
  const blocks: PaperBlock[] = [];
  for (const line of lines) {
    const match = line.match(startPattern);
    if (match) {
      blocks.push({ number: match[1], lines: [match[2] || ""] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  const questions: ImportedPaperQuestion[] = [];
  for (const block of blocks) {
    const questionUnits = splitSubparts(block);
    for (const unit of questionUnits) {
      const bodyLines = unit.text.split("\n").map(line => line.trim()).filter(Boolean);
      const fullText = bodyLines.join("\n");
      if (fullText.replace(/\W/g, "").length < 8) continue;
      const marks = marksFor(fullText);
      const detected = findOptions(bodyLines);
      const trueFalseLines = bodyLines.filter(line => /^(?:true|false)$/i.test(line));
      const combinedTrueFalseLine = bodyLines.find(line => /^true(?:\s*\/\s*|\s+)false$/i.test(line));
      const isTrueFalse = (trueFalseLines.some(line => /^true$/i.test(line)) && trueFalseLines.some(line => /^false$/i.test(line))) || Boolean(combinedTrueFalseLine);
      const isMultipleChoice = detected.options.length >= 3;
      const isTrueFalseQuestion = !isMultipleChoice && isTrueFalse;
      const promptLines = isMultipleChoice ? detected.stemLines : isTrueFalseQuestion ? bodyLines.filter(line => !/^(?:true|false)$/i.test(line) && line !== combinedTrueFalseLine) : bodyLines;
      const prompt = stripMarks(promptLines.join("\n").replace(/\n+/g, "\n")).slice(0, 5000);
      questions.push({
        id: crypto.randomUUID(),
        type: isMultipleChoice ? "multiple_choice" : isTrueFalseQuestion ? "true_false" : "short_answer",
        prompt: (unit.number + ". " + (prompt || "Review the source paper for the full question wording.")).slice(0, 5000),
        options: isMultipleChoice ? detected.options : isTrueFalseQuestion ? ["True", "False"] : ["", "", "", ""],
        answer: "",
        acceptedAnswers: [],
        pairs: [{ left: "", right: "" }, { left: "", right: "" }],
        explanation: "",
        points: marks,
        difficulty: "Standard",
        topic: "",
      });
    }
  }
  return questions;
}

export async function extractPastPaperQuestions(
  file: File,
  onProgress: ProgressCallback = () => undefined,
): Promise<{ pageCount: number; questions: ImportedPaperQuestion[] }> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error("Past-paper question extraction currently accepts PDF files.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("This PDF exceeds the 25 MB limit. Compress it or split it into smaller sections.");
  }
  onProgress("Opening the past paper…");
  const extracted = await extractPdfText(file, onProgress);
  const questions = parsePastPaperQuestions(extracted.text);
  return { pageCount: extracted.pageCount, questions };
}
