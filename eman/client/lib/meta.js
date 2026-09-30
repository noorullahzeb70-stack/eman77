import { useEffect } from 'react';

/** Set document title and meta description for SEO/social sharing. */
export function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title.includes('EMAN') ? title : `${title} · EMAN`;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
      m.content = description;
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    }
  }, [title, description]);
}

export function timeAgo(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Hand a prompt to the chat page (via sessionStorage, so long texts don't go in the URL). */
export function startChatWith(prompt, navigate, loggedIn = true) {
  try { sessionStorage.setItem('eman-pending-prompt', prompt); } catch { /* storage unavailable */ }
  const target = '/chat?start=1';
  navigate(loggedIn ? target : `/register?next=${encodeURIComponent(target)}`);
}

export function takePendingPrompt() {
  try {
    const p = sessionStorage.getItem('eman-pending-prompt');
    if (p) sessionStorage.removeItem('eman-pending-prompt');
    return p;
  } catch {
    return null;
  }
}
