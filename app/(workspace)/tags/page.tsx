import { WorkspaceCollectionView } from "@/components/workspace/workspace-collection-view";
import { WorkspaceView } from "@/components/workspace/workspace-view";

export default function Page() {
  return (
    <WorkspaceView route={{ view: "tags" }}>
      <WorkspaceCollectionView kind="tags" />
    </WorkspaceView>
  );
}
