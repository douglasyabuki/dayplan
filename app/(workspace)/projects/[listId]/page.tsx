import { WorkspaceView } from "@/components/workspace/workspace-view";

export default async function Page({
  params,
}: PageProps<"/projects/[listId]">) {
  const { listId } = await params;
  return <WorkspaceView route={{ view: "projects", selectedId: listId }} />;
}
