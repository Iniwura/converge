import ConvergeClient from "@/components/converge/converge-client";

export default async function Objective({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConvergeClient view="objective" objectiveId={id} />;
}
