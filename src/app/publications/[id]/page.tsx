import { CoverStep } from "@/components/cover-step";

// Page serveur volontairement minimale : elle ne fait que résoudre le segment
// dynamique, tout l'interactif vit dans le composant client.
export default async function PublicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CoverStep publicationId={id} />;
}
