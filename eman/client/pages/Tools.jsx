import { useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, Modal } from '../components/ui/Primitives.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Form.jsx';
import { useRouter } from '../lib/router.jsx';
import { usePageMeta, startChatWith } from '../lib/meta.js';

const LEVELS = ['a complete beginner', 'a school student', 'a university student', 'an advanced learner'];

export const TOOLS = [
  {
    id: 'explain', icon: 'lightbulb', title: 'Explain a topic', text: 'Any concept, explained simply at your level.',
    fields: [{ k: 'topic', label: 'Topic', ph: 'e.g. How does the heart pump blood?' }, { k: 'level', label: 'My level', type: 'level' }],
    prompt: (v) => `Explain "${v.topic}" to me as ${v.level}. Structure your answer as: 1) a direct answer in 2–3 sentences, 2) a step-by-step explanation, 3) a simple example or analogy, 4) important notes and common mistakes.`,
  },
  {
    id: 'summarize', icon: 'list', title: 'Summarizer', text: 'Paste notes or an article — get the key points.',
    fields: [{ k: 'text', label: 'Text to summarize', type: 'long', ph: 'Paste your text here…' }, { k: 'length', label: 'Length', type: 'select', options: ['Short (5 bullet points)', 'Medium (a paragraph + key points)', 'Detailed (section by section)'] }],
    prompt: (v) => `Summarize the following text. Format: ${v.length}. Then list 3 key terms with one-line definitions.\n\n"""\n${v.text}\n"""`,
  },
  {
    id: 'quiz', icon: 'quiz', title: 'Quiz generator', text: 'Test yourself with multiple-choice questions.',
    fields: [{ k: 'topic', label: 'Topic', ph: 'e.g. Cell biology' }, { k: 'count', label: 'Questions', type: 'select', options: ['5', '10', '15'] }, { k: 'level', label: 'Difficulty', type: 'select', options: ['Easy', 'Medium', 'Hard'] }],
    prompt: (v) => `Create a ${v.level.toLowerCase()} multiple-choice quiz with ${v.count} questions about "${v.topic}". Number each question and give four options (A–D). Do NOT show answers after each question. At the very end, under a heading "Answer key", list the correct letter for each question with a one-sentence explanation.`,
  },
  {
    id: 'flashcards', icon: 'cards', title: 'Flashcards', text: 'Question-and-answer cards for revision.',
    fields: [{ k: 'topic', label: 'Topic', ph: 'e.g. Pharmacology of local anaesthetics' }, { k: 'count', label: 'Cards', type: 'select', options: ['10', '15', '20'] }],
    prompt: (v) => `Make ${v.count} study flashcards about "${v.topic}". Present them as a Markdown table with columns "#", "Front (question)" and "Back (answer)". Keep answers short and precise.`,
  },
  {
    id: 'plan', icon: 'calendar', title: 'Study plan', text: 'A realistic schedule for your exam or goal.',
    fields: [{ k: 'topic', label: 'What are you studying for?', ph: 'e.g. Final exam in Community Medicine' }, { k: 'days', label: 'Days available', ph: 'e.g. 14' }, { k: 'hours', label: 'Hours per day', ph: 'e.g. 2' }],
    prompt: (v) => `Create a study plan for: "${v.topic}". I have ${v.days || 'a few'} days and about ${v.hours || '2'} hours per day. Give a day-by-day table (Day, Focus, Tasks, Time), include spaced revision and practice tests, and end with 5 practical study tips.`,
  },
  {
    id: 'code', icon: 'code', title: 'Code explainer', text: 'Understand what code does, line by line.',
    fields: [{ k: 'code', label: 'Code', type: 'long', mono: true, ph: 'Paste code here…' }, { k: 'level', label: 'My level', type: 'level' }],
    prompt: (v) => `Explain this code to me as ${v.level}. First say in one sentence what it does, then walk through it step by step, point out any bugs or risky parts, and suggest one improvement.\n\n\`\`\`\n${v.code}\n\`\`\``,
  },
  {
    id: 'writing', icon: 'feather', title: 'Writing assistant', text: 'Improve grammar, clarity and structure.',
    fields: [{ k: 'text', label: 'Your writing', type: 'long', ph: 'Paste your paragraph, essay or email…' }, { k: 'goal', label: 'Goal', type: 'select', options: ['Fix grammar and spelling only', 'Make it clearer and more concise', 'Make it more formal/academic', 'Make it more friendly'] }],
    prompt: (v) => `Help me improve this writing. Goal: ${v.goal}. First give the improved version, then a short bullet list of the main changes and why.\n\n"""\n${v.text}\n"""`,
  },
  {
    id: 'translate', icon: 'globe', title: 'Translation', text: 'Translate text between languages.',
    fields: [{ k: 'text', label: 'Text', type: 'long', ph: 'Text to translate…' }, { k: 'to', label: 'Translate to', type: 'select', options: ['English', 'Arabic', 'Urdu', 'Hindi', 'Bengali', 'French', 'Spanish', 'Turkish', 'Malay', 'Indonesian'] }],
    prompt: (v) => `Translate the following into ${v.to}. Keep the meaning and tone. After the translation, note any words or phrases that have no exact equivalent.\n\n"""\n${v.text}\n"""`,
  },
];

export default function Tools() {
  usePageMeta('Study Tools');
  const { query, navigate } = useRouter();
  const [active, setActive] = useState(() => TOOLS.find((t) => t.id === query.get('tool')) || null);
  const [vals, setVals] = useState(() => ({ topic: query.get('topic') || '' }));
  const [errs, setErrs] = useState({});

  const open = (t) => { setActive(t); setVals({}); setErrs({}); };
  const submit = (e) => {
    e?.preventDefault();
    const v = { ...vals };
    const er = {};
    for (const f of active.fields) {
      if (f.type === 'level') v[f.k] ||= LEVELS[1];
      else if (f.type === 'select') v[f.k] ||= f.options[f.k === 'level' ? 1 : 0];
      else if (!String(v[f.k] || '').trim() && f.k !== 'days' && f.k !== 'hours') er[f.k] = `Please fill in “${f.label}”.`;
    }
    setErrs(er);
    if (Object.keys(er).length) return;
    startChatWith(active.prompt(v), navigate);
  };

  return (
    <AppLayout>
      <div className="app-page-head">
        <h1 className="app-title">Study Tools</h1>
        <p className="muted">Pick a tool, fill in a few details, and Eman does the rest. Results open as a conversation you can continue.</p>
      </div>
      <div className="grid" style={{ '--min': '240px' }}>
        {TOOLS.map((t, i) => (
          <button key={t.id} className="card card-interactive tool-card animate-in" style={{ animationDelay: `${i * 30}ms` }} onClick={() => open(t)}>
            <div className={`icon-tile ${i % 3 === 1 ? 'gold' : ''}`}><Icon name={t.icon} /></div>
            <p className="cap-title">{t.title}</p>
            <p className="muted text-sm">{t.text}</p>
            <span className="tool-go">Open <Icon name="arrow-right" size={14} /></span>
          </button>
        ))}
      </div>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.title ?? ''}
        size={620}
        footer={<><Button variant="secondary" onClick={() => setActive(null)}>Cancel</Button><Button icon="sparkles" onClick={submit}>Generate</Button></>}
      >
        {active && (
          <form className="stack" style={{ '--gap': 'var(--space-4)' }} onSubmit={submit}>
            <p className="muted text-sm">{active.text}</p>
            {active.fields.map((f) => (
              <Field key={f.k} label={f.label} error={errs[f.k]}>
                {(p) =>
                  f.type === 'long' ? (
                    <Textarea {...p} rows={8} placeholder={f.ph} value={vals[f.k] || ''} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} style={f.mono ? { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' } : undefined} maxLength={20000} />
                  ) : f.type === 'level' ? (
                    <Select {...p} value={vals[f.k] || LEVELS[1]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}>
                      {LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1).replace(/^an? /, '')}</option>)}
                    </Select>
                  ) : f.type === 'select' ? (
                    <Select {...p} value={vals[f.k] || f.options[f.k === 'level' ? 1 : 0]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}>
                      {f.options.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input {...p} placeholder={f.ph} value={vals[f.k] || ''} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} autoFocus={f === active.fields[0]} maxLength={300} />
                  )
                }
              </Field>
            ))}
          </form>
        )}
      </Modal>
    </AppLayout>
  );
}
