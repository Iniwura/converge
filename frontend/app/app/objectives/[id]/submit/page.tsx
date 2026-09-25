import ConvergeClient from "@/components/converge/converge-client";

export default async function Submit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConvergeClient view="submit" objectiveId={id} />;
}
