import { WorkspaceView } from "@/components/workspace/workspace-view";

export default async function Page({ params }: PageProps<"/tags/[tagId]">) {
  const { tagId } = await params;
  return <WorkspaceView route={{ view: "tags", selectedId: tagId }} />;
}
