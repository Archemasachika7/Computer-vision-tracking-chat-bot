import { NextResponse } from 'next/server';

/* ── Shared types ─────────────────────────────────────────────────────── */
interface ParsedOption  { text: string; is_correct: boolean }
interface ParsedQuestion {
  type: 'mcq' | 'msq' | 'integer';
  text: string;
  points: number;
  options: ParsedOption[];
  integer_answer?: string;
}
interface ParsedQuiz {
  meta: { title?: string; category?: string; duration_minutes?: number; description?: string };
  questions: ParsedQuestion[];
}

/* ══════════════════════════════════════════════════════════════════════
   DOCX PARSER — converts via mammoth, then parses the raw text
══════════════════════════════════════════════════════════════════════ */
async function parseDocx(buffer: Buffer): Promise<ParsedQuiz> {
  const mammoth = await import('mammoth');
  const { value: rawText } = await mammoth.extractRawText({ buffer });

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const meta: ParsedQuiz['meta'] = {};
  const questions: ParsedQuestion[] = [];
  let i = 0;

  // Header lines
  while (i < lines.length) {
    const l = lines[i];
    if (/^QUIZ TITLE:/i.test(l)) { meta.title = l.replace(/^QUIZ TITLE:\s*/i, ''); i++; continue; }
    if (/^TITLE:/i.test(l))      { meta.title = l.replace(/^TITLE:\s*/i, ''); i++; continue; }
    if (/^CATEGORY:/i.test(l))   { meta.category = l.replace(/^CATEGORY:\s*/i, ''); i++; continue; }
    if (/^DURATION:/i.test(l))   { meta.duration_minutes = parseInt(l.replace(/^DURATION:\s*/i, '')); i++; continue; }
    if (/^DESCRIPTION:/i.test(l)){ meta.description = l.replace(/^DESCRIPTION:\s*/i, ''); i++; continue; }
    if (/^---/.test(l))          { i++; continue; }
    // Start of questions
    break;
  }

  // Question blocks:  Q1 [MCQ] [5pts] or Q1. [MSQ]
  const qHeaderRe = /^Q\d+[\.\s]\s*\[(MCQ|MSQ|INTEGER)\](?:\s*\[(\d+)pts\])?/i;

  while (i < lines.length) {
    const l = lines[i];
    const hm = l.match(qHeaderRe);
    if (!hm) { i++; continue; }

    const type = hm[1].toLowerCase() as 'mcq' | 'msq' | 'integer';
    const points = hm[2] ? parseInt(hm[2]) : 5;
    i++;

    // Next non-empty line is the question text
    const text = lines[i] ?? '';
    i++;

    const options: ParsedOption[] = [];
    let integer_answer: string | undefined;

    // Read options / answer lines
    while (i < lines.length) {
      const ol = lines[i];
      if (qHeaderRe.test(ol)) break; // next question starts

      if (type === 'integer') {
        const am = ol.match(/^ANSWER:\s*(.+)/i);
        if (am) { integer_answer = am[1].trim(); i++; break; }
      } else {
        // A) Option text [CORRECT] or Option text *CORRECT*
        const om = ol.match(/^[A-Z]\)\s*(.+)/);
        if (om) {
          const raw = om[1];
          const is_correct = /\[CORRECT\]/i.test(raw) || /\*CORRECT\*/i.test(raw);
          const optText = raw.replace(/\s*\[CORRECT\]/gi, '').replace(/\s*\*CORRECT\*/gi, '').trim();
          options.push({ text: optText, is_correct });
          i++;
          continue;
        }
      }
      i++;
    }

    questions.push({ type, text, points, options, integer_answer });
  }

  return { meta, questions };
}

/* ══════════════════════════════════════════════════════════════════════
   HTML PARSER — uses cheerio to parse structured HTML
══════════════════════════════════════════════════════════════════════
   Expected format:
   <meta name="quiz-title" content="...">
   <meta name="category" content="...">
   <meta name="duration" content="30">
   <div class="question" data-type="mcq" data-points="5">
     <p>Question text</p>
     <ul>
       <li>Option A</li>
       <li class="correct">Option B</li>
     </ul>
   </div>
══════════════════════════════════════════════════════════════════════ */
async function parseHtml(html: string): Promise<ParsedQuiz> {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const meta: ParsedQuiz['meta'] = {
    title:            $('meta[name="quiz-title"]').attr('content')
                   ?? $('meta[name="title"]').attr('content'),
    category:         $('meta[name="category"]').attr('content'),
    duration_minutes: parseInt($('meta[name="duration"]').attr('content') ?? '30'),
    description:      $('meta[name="description"]').attr('content'),
  };

  const questions: ParsedQuestion[] = [];

  $('.question').each((_, el) => {
    const type  = ($(el).attr('data-type') ?? 'mcq').toLowerCase() as 'mcq' | 'msq' | 'integer';
    const points = parseInt($(el).attr('data-points') ?? '5');
    const text   = $(el).find('p, .question-text, h3, h4').first().text().trim();

    if (type === 'integer') {
      const answer = $(el).find('.correct-answer, .answer, p.answer').last().text().trim();
      questions.push({ type, text, points, options: [], integer_answer: answer });
    } else {
      const options: ParsedOption[] = [];
      $(el).find('li').each((_, li) => {
        const is_correct = $(li).hasClass('correct') || $(li).attr('data-correct') === 'true';
        options.push({ text: $(li).text().trim(), is_correct });
      });
      questions.push({ type, text, points, options });
    }
  });

  return { meta, questions };
}

/* ══════════════════════════════════════════════════════════════════════
   ROUTE HANDLER
══════════════════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const name   = file.name.toLowerCase();

    let result: ParsedQuiz;

    if (name.endsWith('.docx')) {
      result = await parseDocx(buffer);
    } else if (name.endsWith('.html') || name.endsWith('.htm')) {
      result = await parseHtml(buffer.toString('utf-8'));
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use .docx or .html' }, { status: 400 });
    }

    if (result.questions.length === 0) {
      return NextResponse.json({ error: 'No questions found in the file. Check the format.' }, { status: 422 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Quiz upload parse error:', err);
    return NextResponse.json({ error: `Parse failed: ${err.message}` }, { status: 500 });
  }
}
