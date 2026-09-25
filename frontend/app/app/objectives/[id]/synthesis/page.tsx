import ConvergeClient from "@/components/converge/converge-client";

export default async function Synthesis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConvergeClient view="synthesis" objectiveId={id} />;
}
