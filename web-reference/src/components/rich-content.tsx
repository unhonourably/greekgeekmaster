"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { cx } from "@/components/ui";
import { PhotoStrip } from "@/components/rich-view";
import { sanitizeRichText } from "@/lib/rich-text";

type Upload = (formData: FormData) => Promise<{ path?: string; error?: string }>;

export function RichEditor({ name, id, initial = "", upload, placeholder = "Write the details" }: { name: string; id?: string; initial?: string; upload?: Upload; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);
  const [html, setHtml] = useState(() => sanitizeRichText(initial));
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("https://");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const sync = () => setHtml(ref.current?.innerHTML ?? "");
  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };
  const addLink = () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      setError("Use a full web address, starting with https://");
      return;
    }
    setError(null);
    run("createLink", url);
    setLinkOpen(false);
  };

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      if (ref.current) ref.current.innerHTML = "";
      setHtml("");
      setError(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas px-1.5 py-1">
        <Tool label="Bold" onClick={() => run("bold")}><Bold className="size-3.5" /></Tool>
        <Tool label="Italic" onClick={() => run("italic")}><Italic className="size-3.5" /></Tool>
        <Tool label="Underline" onClick={() => run("underline")}><Underline className="size-3.5" /></Tool>
        <Tool label="Strikethrough" onClick={() => run("strikeThrough")}><Strikethrough className="size-3.5" /></Tool>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <Tool label="Heading" onClick={() => run("formatBlock", "h2")}><Heading2 className="size-3.5" /></Tool>
        <Tool label="Bulleted list" onClick={() => run("insertUnorderedList")}><List className="size-3.5" /></Tool>
        <Tool label="Numbered list" onClick={() => run("insertOrderedList")}><ListOrdered className="size-3.5" /></Tool>
        <Tool label="Quote" onClick={() => run("formatBlock", "blockquote")}><Quote className="size-3.5" /></Tool>
        <Tool label="Link" onClick={() => setLinkOpen((v) => !v)}><Link2 className="size-3.5" /></Tool>
        {upload ? <Tool label="Insert picture" onClick={() => fileRef.current?.click()}><ImagePlus className="size-3.5" /></Tool> : null}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <Tool label="Undo" onClick={() => run("undo")}><Undo2 className="size-3.5" /></Tool>
        <Tool label="Redo" onClick={() => run("redo")}><Redo2 className="size-3.5" /></Tool>
        {uploading ? <span className="px-2 text-[12px] text-ink-3">Uploading</span> : null}
      </div>
      {linkOpen ? (
        <div className="flex gap-2 border-b border-line bg-canvas px-2 py-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            aria-label="Link address"
            className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:border-accent"
          />
          <button type="button" onClick={addLink} className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent">Add link</button>
        </div>
      ) : null}
      <div
        id={id}
        ref={(node) => {
          ref.current = node;
          if (node && !seeded.current) {
            node.innerHTML = sanitizeRichText(initial);
            seeded.current = true;
          }
        }}
        role="textbox"
        aria-multiline="true"
        aria-label="Details"
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        className="rich-content min-h-48 px-4 py-3 text-sm leading-relaxed text-ink outline-none"
      />
      <input type="hidden" name={name} value={html} />
      {upload ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !upload) return;
            setUploading(true);
            setError(null);
            const body = new FormData();
            body.set("file", file);
            const result = await upload(body);
            setUploading(false);
            if (!result.path) {
              setError(result.error ?? "Could not add that picture.");
              return;
            }
            run("insertHTML", `<img src="/api/chapter-media/${result.path}" alt="">`);
          }}
        />
      ) : null}
      {error ? <p className="border-t border-line px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink">
      {children}
    </button>
  );
}

export function PhotoPicker({ name, upload, initial = [] }: { name: string; upload: Upload; initial?: string[] }) {
  const [paths, setPaths] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setPaths([]);
      setError(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <div ref={box} className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(paths)} />
      <PhotoStrip paths={paths} />
      <div className="flex flex-wrap items-center gap-3">
        <label className={cx("inline-flex h-9 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-subtle", (busy || paths.length >= 6) && "pointer-events-none opacity-50")}>
          {busy ? "Uploading" : "Add a picture"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={busy || paths.length >= 6}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              const body = new FormData();
              body.set("file", file);
              const result = await upload(body);
              setBusy(false);
              if (!result.path) {
                setError(result.error ?? "Could not add that picture.");
                return;
              }
              setPaths((prev) => (prev.includes(result.path!) || prev.length >= 6 ? prev : [...prev, result.path!]));
            }}
          />
        </label>
        <span className="text-[12px] text-ink-3">{paths.length} of 6</span>
      </div>
      {paths.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {paths.map((path, i) => (
            <li key={path}>
              <button type="button" className="text-[12px] text-ink-3 hover:text-danger" onClick={() => setPaths((prev) => prev.filter((p) => p !== path))}>
                Remove picture {i + 1}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
