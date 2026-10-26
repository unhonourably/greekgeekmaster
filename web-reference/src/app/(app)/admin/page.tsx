import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export default async function AdminHome() {
  const { role } = await requireStaff(["reviewer", "support", "finance"]);
  if (role === "finance") redirect("/admin/revenue");
  if (role === "support") redirect("/admin/chapters");
  redirect("/admin/verification");
}
