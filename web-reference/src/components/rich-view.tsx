import { sanitizeRichText } from "@/lib/rich-text";
import { cx } from "@/components/ui";

export function RichContent({ value, className }: { value: string; className?: string }) {
  if (!/<[a-z]/i.test(value)) return <p className={cx("whitespace-pre-wrap text-sm leading-relaxed text-ink-2", className)}>{value}</p>;
  return <div className={cx("rich-content text-sm leading-relaxed text-ink-2", className)} dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }} />;
}

export function PhotoStrip({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {paths.map((path) => (
        <li key={path} className="overflow-hidden rounded-md border border-line bg-canvas">
          <img src={`/api/chapter-media/${path}`} alt="" className="aspect-[4/3] w-full object-cover" />
        </li>
      ))}
    </ul>
  );
}
