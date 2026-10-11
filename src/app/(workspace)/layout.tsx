import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { session } from "@/lib/security";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await session(
      new Request("http://localhost", { headers: await headers() }),
    );
  } catch {
    redirect("/login");
  }
  return children;
}
