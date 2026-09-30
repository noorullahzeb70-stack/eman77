// Safe Markdown rendering: marked → HTML → allow-list sanitizer → lightweight syntax highlighting.
import { Marked } from 'marked';

const md = new Marked({ gfm: true, breaks: false });

const ALLOWED = new Set(['P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SUP', 'SUB', 'SPAN', 'INPUT', 'KBD']);
const ATTRS = { A: ['href', 'title'], CODE: ['class'], TH: ['align'], TD: ['align'], INPUT: ['type', 'checked', 'disabled'], OL: ['start'] };

function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          // Drop dangerous elements entirely; unwrap unknown harmless ones.
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'LINK', 'META'].includes(child.tagName)) child.remove();
          else { walk(child); child.replaceWith(...child.childNodes); }
          continue;
        }
        const keep = ATTRS[child.tagName] || [];
        for (const a of [...child.attributes]) if (!keep.includes(a.name)) child.removeAttribute(a.name);
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';
          if (!/^(https?:|mailto:|#|\/)/i.test(href)) child.removeAttribute('href');
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer nofollow');
        }
        if (child.tagName === 'INPUT' && child.getAttribute('type') !== 'checkbox') { child.remove(); continue; }
        walk(child);
      }
    }
  };
  walk(root);
  return root;
}

/* ── Syntax highlighting (keywords, strings, comments, numbers) ── */
const KW = {
  js: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false yield static get set',
  py: 'def return if elif else for while in not and or is class import from as try except finally raise with lambda pass break continue None True False global nonlocal yield async await print self',
  c: 'int float double char void long short unsigned signed const static struct union enum typedef return if else for while do switch case break continue sizeof include define bool true false class public private protected virtual new delete namespace using std template typename auto nullptr this cout cin endl string vector',
  java: 'public private protected class interface extends implements static final void int double float boolean char long new return if else for while do switch case break continue try catch finally throw throws import package this null true false String',
  sql: 'select from where insert into values update set delete create table drop alter join left right inner outer on group by order having limit as and or not null primary key foreign references index distinct count sum avg min max',
  html: '',
  css: '',
};
const ALIAS = { javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', json: 'js', python: 'py', cpp: 'c', 'c++': 'c', h: 'c', csharp: 'java', cs: 'java', kotlin: 'java', go: 'java', rust: 'c', php: 'js', bash: 'py', sh: 'py', shell: 'py' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(code, lang) {
  const l = ALIAS[lang] || lang;
  if (l === 'html' || l === 'xml') {
    return esc(code)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-c">$1</span>')
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tk-k">$2</span>')
      .replace(/([\w-]+)=(&quot;|")(.*?)(\2)/g, '<span class="tk-a">$1</span>=<span class="tk-s">"$3"</span>');
  }
  if (l === 'css') {
    return esc(code)
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-c">$1</span>')
      .replace(/([\w-]+)(\s*:)(?!\/)/g, '<span class="tk-a">$1</span>$2')
      .replace(/(#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|rem|em|%|vh|vw|s|ms)?\b)/g, '<span class="tk-n">$1</span>');
  }
  const kws = new Set((KW[l] || KW.js).split(' '));
  const lineComment = l === 'py' || l === 'sql' ? (l === 'sql' ? '--' : '#') : '//';
  const re = new RegExp(
    [
      '(\\/\\*[\\s\\S]*?\\*\\/)', // block comment
      `(${lineComment.replace(/\//g, '\\/')}[^\\n]*)`, // line comment
      '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)', // strings
      '(\\b\\d+(?:\\.\\d+)?\\b)', // numbers
      '([A-Za-z_]\\w*)', // identifiers
    ].join('|'),
    'g',
  );
  let out = '';
  let last = 0;
  code.replace(re, (m, bc, lc, str, num, id, idx) => {
    out += esc(code.slice(last, idx));
    if (bc || lc) out += `<span class="tk-c">${esc(m)}</span>`;
    else if (str) out += `<span class="tk-s">${esc(m)}</span>`;
    else if (num) out += `<span class="tk-n">${m}</span>`;
    else if (id && kws.has(l === 'sql' ? id.toLowerCase() : id)) out += `<span class="tk-k">${m}</span>`;
    else if (id && code[idx + m.length] === '(') out += `<span class="tk-f">${m}</span>`;
    else out += esc(m);
    last = idx + m.length;
    return m;
  });
  return out + esc(code.slice(last));
}

/** Render markdown to a sanitized DOM fragment (as HTML string). */
export function renderMarkdown(src) {
  const html = md.parse(src || '');
  const root = sanitize(html);
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const lang = ((code.getAttribute('class') || '').match(/language-([\w+#-]+)/) || [])[1] || '';
    code.innerHTML = highlight(code.textContent, lang.toLowerCase());
    const wrap = root.ownerDocument.createElement('div');
    wrap.className = 'code-block';
    wrap.setAttribute('data-lang', lang || 'text');
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
  }
  for (const t of root.querySelectorAll('table')) {
    const wrap = root.ownerDocument.createElement('div');
    wrap.className = 'table-wrap';
    t.replaceWith(wrap);
    wrap.appendChild(t);
  }
  return root.innerHTML;
}
