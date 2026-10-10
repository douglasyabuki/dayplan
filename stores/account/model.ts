export type AccountProfile = {
  name: string;
  email: string;
  avatarUrl?: string;
};

export const mockAccount: AccountProfile = {
  name: "Yuji",
  email: "yuji@example.com",
};
