export type SaveStatus =
  "Saved" | "Pending" | "Saving" | "Offline" | "Needs attention";

export type SaveFeedback = {
  status: SaveStatus;
  label: string;
  description: string;
};

export function workspaceSaveFeedback(input: {
  database: boolean;
  ready: boolean;
  blocked: boolean;
  offline: boolean;
  pending: boolean;
  saving: boolean;
  deletionPaused: boolean;
  durableRecovery: boolean;
}): SaveFeedback {
  const status: SaveStatus =
    input.deletionPaused || input.blocked
      ? "Needs attention"
      : !input.ready
        ? "Saving"
        : input.database && input.offline
          ? "Offline"
          : input.saving
            ? "Saving"
            : input.pending
              ? "Pending"
              : "Saved";
  const safety = input.durableRecovery
    ? "Your pending workspace edits have browser recovery protection. They are not yet confirmed by account storage."
    : "Keep this page open or download a backup until saving is confirmed. Edits may only be available in this session.";
  return {
    status,
    label: input.deletionPaused
      ? "Deletion paused"
      : !input.ready
        ? "Loading workspace"
        : status === "Saved" && !input.database
          ? "Saved in this browser"
          : status,
    description: input.deletionPaused
      ? "Account changes are paused while deletion is checked."
      : !input.ready
        ? "Loading saved workspace data."
        : status === "Saved"
          ? `${input.database ? "Your latest workspace edits are confirmed by account storage." : "Your latest workspace edits were saved in this browser."} Open editor drafts and profile changes have separate save actions.`
          : status === "Pending"
            ? `Workspace edits are waiting for the automatic save. ${input.database ? safety : "Keep this page open."}`
            : status === "Saving"
              ? "Saving workspace edits. Open editor drafts and profile changes are separate."
              : status === "Offline"
                ? `Account storage cannot currently be reached. ${safety}`
                : `Resolve the storage, import, or recovery issue before continuing. ${input.database ? safety : "Changes may only be available in this session. Download a backup before reloading."}`,
  };
}
