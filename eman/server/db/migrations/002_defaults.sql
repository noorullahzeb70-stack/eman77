-- ═══ Migration 002 — default settings and starter categories ═══
-- Settings can all be changed later from the admin panel.

INSERT INTO settings (key, value) VALUES
  ('ai.system_prompt', json_quote(
'You are Eman, a helpful, intelligent and respectful AI assistant for students and learners on the EMAN education platform.

How you work:
- Explain difficult concepts simply and step by step, adapting to the learner''s level.
- For educational questions, structure answers as: 1) a direct answer, 2) an explanation, 3) an example, 4) important notes.
- Help with programming, mathematics, writing, research, study planning and general knowledge.
- Use Markdown: headings, lists, tables, and fenced code blocks with a language tag. Use LaTeX-free plain notation for math unless asked.
- Reply in the language the user writes in.
- If you do not know something or are unsure, say so clearly. Never invent facts, sources, quotes or references.
- Encourage understanding over copying: for homework, guide the learner through the reasoning.
- Be warm, patient and concise. Avoid unnecessary filler.')),
  ('ai.limits', json('{"requestsPerUserPerDay": 100, "requestsPerMinute": 10, "maxInputChars": 24000, "maxOutputTokens": 2048}')),
  ('ai.allow_user_keys', json('true')),
  ('ai.tier_labels', json('{"fast": "Fast", "balanced": "Balanced", "advanced": "Advanced"}')),
  ('site.branding', json('{"name": "EMAN", "tagline": "AI • Education • Knowledge • Creativity", "logoFileId": null}')),
  ('site.homepage', json('{"heroTitle": "EMAN", "heroSubtitle": "Your Intelligent Companion for Learning, Knowledge & Creativity.", "heroDescription": "Ask questions, understand difficult topics, practise with AI study tools and explore a growing library of learning resources — all in one calm, focused place.", "ctaTitle": "Start Your Journey With Eman"}')),
  ('site.contact', json('{"email": null, "notifyAdmins": true}')),
  ('auth.registration_open', json('true')),
  ('auth.require_email_verification', json('false')),
  ('uploads.limits', json('{"imageMaxMB": 8, "documentMaxMB": 25, "chatAttachmentMaxMB": 10}'));

-- Book categories
INSERT INTO categories (id, type, name, slug, icon, sort_order) VALUES
  ('cat_b_cs',   'book', 'Computer Science',        'computer-science',        'cpu', 1),
  ('cat_b_ai',   'book', 'Artificial Intelligence', 'artificial-intelligence', 'sparkles', 2),
  ('cat_b_sec',  'book', 'Cyber Security',          'cyber-security',          'shield', 3),
  ('cat_b_prog', 'book', 'Programming',             'programming',             'code', 4),
  ('cat_b_math', 'book', 'Mathematics',             'mathematics',             'calculator', 5),
  ('cat_b_eng',  'book', 'English',                 'english',                 'feather', 6),
  ('cat_b_isl',  'book', 'Islamic Studies',         'islamic-studies',         'book-open', 7),
  ('cat_b_gk',   'book', 'General Knowledge',       'general-knowledge',       'globe', 8),
  ('cat_b_lit',  'book', 'Literature',              'literature',              'pen', 9);

-- Education subjects
INSERT INTO categories (id, type, name, slug, icon, description, sort_order) VALUES
  ('cat_e_prog', 'education', 'Programming',             'programming',             'code',       'C++, Python, HTML, CSS and JavaScript — from first steps to real projects.', 1),
  ('cat_e_cs',   'education', 'Computer Science',        'computer-science',        'cpu',        'How computers work: data structures, algorithms, systems and networks.', 2),
  ('cat_e_ai',   'education', 'Artificial Intelligence', 'artificial-intelligence', 'sparkles',   'Machine learning, neural networks and using AI responsibly.', 3),
  ('cat_e_sec',  'education', 'Cyber Security',          'cyber-security',          'shield',     'Staying safe online and the foundations of defensive security.', 4),
  ('cat_e_math', 'education', 'Mathematics',             'mathematics',             'calculator', 'Algebra, calculus, statistics and problem-solving strategies.', 5),
  ('cat_e_eng',  'education', 'English',                 'english',                 'feather',    'Grammar, vocabulary, reading comprehension and clear writing.', 6);

-- Gallery categories
INSERT INTO categories (id, type, name, slug, icon, sort_order) VALUES
  ('cat_g_campus',  'gallery', 'Campus & Classroom', 'campus',  'graduation', 1),
  ('cat_g_events',  'gallery', 'Events',             'events',  'calendar', 2),
  ('cat_g_science', 'gallery', 'Science',            'science', 'lightbulb', 3),
  ('cat_g_art',     'gallery', 'Art & Design',       'art',     'pen', 4),
  ('cat_g_nature',  'gallery', 'Nature',             'nature',  'globe', 5);
