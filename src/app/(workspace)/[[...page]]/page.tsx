import { Workspace } from "@/components/workspace";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ page?: string[] }>;
}) {
  const { page = [] } = await params;
  const valid = [
    "prospectos",
    "buscar",
    "campanas",
    "llamadas",
    "correos",
    "calendario",
    "actividad",
    "estadisticas",
    "configuracion",
  ];
  if (
    page.length &&
    (!valid.includes(page[0]) ||
      (page.length > 1 && (page[0] !== "prospectos" || page.length !== 2)))
  )
    notFound();
  return <Workspace />;
}
