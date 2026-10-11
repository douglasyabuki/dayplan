"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAccount } from "@/stores/account/provider";

export function AccountAvatar({ className }: { className?: string }) {
  const { profile } = useAccount();
  const initial =
    Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        profile.name,
      ),
    )[0]?.segment ?? "Y";
  return (
    <Avatar className={className} aria-label={`${profile.name}'s avatar`}>
      {profile.avatarUrl && (
        <AvatarImage src={profile.avatarUrl} alt={profile.name} />
      )}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
