import ConvergeClient from "@/components/converge/converge-client";

export default async function Plans({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConvergeClient view="plans" objectiveId={id} />;
}
