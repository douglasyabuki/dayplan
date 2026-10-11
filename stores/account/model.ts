export type AccountProfile = {
  name: string;
  email?: string;
  avatarUrl?: string;
};

export const guestProfile: AccountProfile = { name: "Guest" };

export type ProfileUpdateStatus = "idle" | "pending" | "success" | "error";
