export type EmailContent = {
  preheader: string;
  heading: string;
  greeting?: string | null;
  paragraphs: string[];
  action?: { label: string; url: string } | null;
  code?: string | null;
  note?: string | null;
  footer?: string | null;
  appUrl: string;
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : "#";
}

export function renderEmailHtml(content: EmailContent): string {
  const paragraphs = [
    ...(content.greeting ? [content.greeting] : []),
    ...content.paragraphs,
  ];
  const body = paragraphs
    .map((p) => `<p style="font-size:15px;line-height:1.8;color:#bdbdbd;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const code = content.code
    ? `<p style="font-size:28px;letter-spacing:8px;font-weight:700;color:#ffffff;margin:0 0 32px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${escapeHtml(content.code)}</p>`
    : "";
  const action =
    content.action && /^https?:\/\//i.test(content.action.url)
      ? `<a href="${safeUrl(content.action.url)}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-size:14px;font-weight:700;padding:16px 30px;border-radius:6px;">${escapeHtml(content.action.label)}</a>`
      : "";
  const note = content.note
    ? `<p style="font-size:12px;line-height:1.7;color:#777777;margin:28px 0 0;">${escapeHtml(content.note)}</p>`
    : "";
  const extra = content.footer
    ? `<p style="text-align:center;font-size:11px;color:#666666;margin:12px 0 0;">${escapeHtml(content.footer)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#000000;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<div style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="background:#111111;border:1px solid #292929;border-radius:12px;padding:48px 32px;text-align:center;">
      <h1 style="font-size:30px;letter-spacing:-1px;color:#ffffff;margin:0 0 20px;">${escapeHtml(content.heading)}</h1>
      ${body}
      ${code}
      ${action}
      ${note}
    </div>
    ${extra}
    <p style="text-align:center;font-size:11px;color:#666666;margin:24px 0 0;">&copy; 2026 greek geek. all rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}
