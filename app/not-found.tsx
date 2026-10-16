import { RecoveryScreen } from "@/components/shared/recovery-screen";

export default function NotFound() {
  return (
    <RecoveryScreen
      title="Page not found"
      description="This address does not match a Dayplan page. Return to Today or open Help to find your way."
      broad
    />
  );
}
