import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";
import { cx } from "@/components/ui";

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center", className)} aria-label={`${brand.name} home`}>
      <Image
        src={brand.logo.src}
        alt={brand.name}
        width={brand.logo.width}
        height={brand.logo.height}
        priority
        className="h-6 w-auto mix-blend-lighten"
      />
    </Link>
  );
}
